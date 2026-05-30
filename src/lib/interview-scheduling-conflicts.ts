import { prisma } from "@/src/lib/prisma";
import type { InterviewStatus } from "@prisma/client";

/** Interviews in these statuses occupy the interviewer's calendar. */
export const ACTIVE_INTERVIEW_STATUSES: InterviewStatus[] = ["SCHEDULED", "RESCHEDULED"];

const MS_PER_MINUTE = 60_000;

/** Max interview length used to widen overlap search window (matches API cap). */
const MAX_INTERVIEW_DURATION_MINUTES = 8 * 60;

export type InterviewTimeRange = {
  startMs: number;
  endMs: number;
};

export type SchedulingOverlapConflict = {
  type: "OVERLAP";
  userId: string;
  userName: string | null;
  userEmail: string | null;
  conflictingInterviewId: string;
  conflictingScheduledAt: string;
  conflictingDurationMinutes: number;
  conflictingStatus: InterviewStatus;
};

export type SchedulingAvailabilityConflict = {
  type: "OUTSIDE_AVAILABILITY";
  userId: string;
  userName: string | null;
  userEmail: string | null;
  timeZone: string;
  localStartTime: string;
  allowedWindow: string;
  reason: string;
};

export type SchedulingConflict =
  | SchedulingOverlapConflict
  | SchedulingAvailabilityConflict;

export function computeInterviewTimeRange(
  scheduledAt: Date,
  durationMinutes: number
): InterviewTimeRange {
  const startMs = scheduledAt.getTime();
  return {
    startMs,
    endMs: startMs + durationMinutes * MS_PER_MINUTE,
  };
}

/** True when [aStart, aEnd) overlaps [bStart, bEnd) (half-open intervals). */
export function intervalsOverlap(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number
): boolean {
  return aStartMs < bEndMs && aEndMs > bStartMs;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getInterviewerWorkWindow(): { startHour: number; endHour: number; allowWeekends: boolean } {
  const startHour = readIntEnv("INTERVIEW_SCHED_WORK_START_HOUR", 8);
  const endHour = readIntEnv("INTERVIEW_SCHED_WORK_END_HOUR", 20);
  const allowWeekends = readBoolEnv("INTERVIEW_SCHED_ALLOW_WEEKENDS", false);
  return {
    startHour: Math.max(0, Math.min(23, startHour)),
    endHour: Math.max(1, Math.min(24, endHour)),
    allowWeekends,
  };
}

type LocalDateTimeParts = {
  hour: number;
  minute: number;
  weekday: string;
};

function getLocalDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { hour, minute, weekday };
  } catch {
    return null;
  }
}

function formatLocalTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

export function checkInterviewerAvailabilityWindow(params: {
  scheduledAt: Date;
  durationMinutes: number;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  timeZone: string | null;
}): SchedulingAvailabilityConflict | null {
  const tz = params.timeZone?.trim() || "UTC";
  const window = getInterviewerWorkWindow();
  const local = getLocalDateTimeParts(params.scheduledAt, tz);
  if (!local) {
    return {
      type: "OUTSIDE_AVAILABILITY",
      userId: params.userId,
      userName: params.userName,
      userEmail: params.userEmail,
      timeZone: tz,
      localStartTime: "unknown",
      allowedWindow: `${window.startHour}:00–${window.endHour}:00`,
      reason: `Invalid or unsupported timezone "${tz}" for interviewer availability check`,
    };
  }

  const allowedWindow = `${window.startHour}:00–${window.endHour}:00`;
  const localStartTime = formatLocalTime(local.hour, local.minute);
  const endLocal = getLocalDateTimeParts(
    new Date(params.scheduledAt.getTime() + params.durationMinutes * MS_PER_MINUTE),
    tz
  );

  if (!window.allowWeekends && isWeekend(local.weekday)) {
    return {
      type: "OUTSIDE_AVAILABILITY",
      userId: params.userId,
      userName: params.userName,
      userEmail: params.userEmail,
      timeZone: tz,
      localStartTime,
      allowedWindow,
      reason: `Interview starts on ${local.weekday} in ${tz}; weekend scheduling is disabled`,
    };
  }

  if (local.hour < window.startHour || local.hour >= window.endHour) {
    return {
      type: "OUTSIDE_AVAILABILITY",
      userId: params.userId,
      userName: params.userName,
      userEmail: params.userEmail,
      timeZone: tz,
      localStartTime,
      allowedWindow,
      reason: `Interview starts at ${localStartTime} ${tz}, outside allowed window ${allowedWindow}`,
    };
  }

  if (endLocal) {
    const endsAfterWindow =
      endLocal.hour > window.endHour ||
      (endLocal.hour === window.endHour && endLocal.minute > 0);
    if (endsAfterWindow) {
      return {
        type: "OUTSIDE_AVAILABILITY",
        userId: params.userId,
        userName: params.userName,
        userEmail: params.userEmail,
        timeZone: tz,
        localStartTime,
        allowedWindow,
        reason: `Interview ends after ${window.endHour}:00 ${tz} (starts ${localStartTime}, duration ${params.durationMinutes} min)`,
      };
    }
  }

  return null;
}

export async function detectInterviewerSchedulingConflicts(params: {
  interviewerUserIds: readonly string[];
  scheduledAt: Date;
  durationMinutes: number;
  excludeInterviewId?: string;
}): Promise<SchedulingConflict[]> {
  const conflicts: SchedulingConflict[] = [];
  const uniqueIds = [...new Set(params.interviewerUserIds)];
  if (uniqueIds.length === 0) return conflicts;

  const proposed = computeInterviewTimeRange(params.scheduledAt, params.durationMinutes);
  const searchStart = new Date(
    proposed.startMs - MAX_INTERVIEW_DURATION_MINUTES * MS_PER_MINUTE
  );
  const searchEnd = new Date(proposed.endMs);

  const assignments = await prisma.interviewInterviewer.findMany({
    where: {
      userId: { in: uniqueIds },
      interview: {
        status: { in: ACTIVE_INTERVIEW_STATUSES },
        scheduledAt: { gte: searchStart, lt: searchEnd },
        ...(params.excludeInterviewId ? { id: { not: params.excludeInterviewId } } : {}),
      },
    },
    select: {
      userId: true,
      user: { select: { id: true, name: true, email: true, profile: { select: { timezone: true } } } },
      interview: {
        select: {
          id: true,
          scheduledAt: true,
          durationMinutes: true,
          status: true,
        },
      },
    },
  });

  const overlapByUser = new Map<string, SchedulingOverlapConflict>();

  for (const row of assignments) {
    const existing = computeInterviewTimeRange(row.interview.scheduledAt, row.interview.durationMinutes);
    if (
      !intervalsOverlap(
        proposed.startMs,
        proposed.endMs,
        existing.startMs,
        existing.endMs
      )
    ) {
      continue;
    }

    if (!overlapByUser.has(row.userId)) {
      overlapByUser.set(row.userId, {
        type: "OVERLAP",
        userId: row.userId,
        userName: row.user.name,
        userEmail: row.user.email,
        conflictingInterviewId: row.interview.id,
        conflictingScheduledAt: row.interview.scheduledAt.toISOString(),
        conflictingDurationMinutes: row.interview.durationMinutes,
        conflictingStatus: row.interview.status,
      });
    }
  }

  conflicts.push(...overlapByUser.values());

  // Availability for all requested interviewers (even when no calendar overlap exists).
  const usersForAvailability = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      name: true,
      email: true,
      profile: { select: { timezone: true } },
    },
  });

  for (const user of usersForAvailability) {
    const availabilityConflict = checkInterviewerAvailabilityWindow({
      scheduledAt: params.scheduledAt,
      durationMinutes: params.durationMinutes,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      timeZone: user.profile?.timezone ?? null,
    });
    if (availabilityConflict) {
      conflicts.push(availabilityConflict);
    }
  }

  return conflicts;
}

export function formatSchedulingConflictMessage(conflicts: readonly SchedulingConflict[]): string {
  const parts: string[] = [];
  for (const c of conflicts) {
    if (c.type === "OVERLAP") {
      const who = c.userName ?? c.userEmail ?? c.userId;
      parts.push(
        `${who} is already assigned to interview ${c.conflictingInterviewId} (${c.conflictingScheduledAt}, ${c.conflictingDurationMinutes} min, ${c.conflictingStatus})`
      );
    } else {
      const who = c.userName ?? c.userEmail ?? c.userId;
      parts.push(`${who}: ${c.reason}`);
    }
  }
  return parts.join("; ");
}
