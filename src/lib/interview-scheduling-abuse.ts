import type { InterviewStatus } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

const ACTIVE_STATUSES: InterviewStatus[] = ["SCHEDULED", "RESCHEDULED"];

export type InterviewSchedulingQuotaError = {
  code: string;
  message: string;
  status: 429;
  details?: Record<string, unknown>;
};

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function interviewEndMs(scheduledAt: Date, durationMinutes: number): number {
  return scheduledAt.getTime() + durationMinutes * 60_000;
}

/**
 * Caps active upcoming interviews and burst creates per application to reduce abuse
 * (email/reminder storms, panel spam).
 */
export async function checkInterviewSchedulingApplicationQuota(
  applicationId: string,
  nowMs = Date.now()
): Promise<InterviewSchedulingQuotaError | null> {
  const maxActive = parsePositiveIntEnv(
    process.env.INTERVIEW_SCHEDULE_MAX_ACTIVE_PER_APPLICATION,
    25
  );
  const maxCreatesPerDay = parsePositiveIntEnv(
    process.env.INTERVIEW_SCHEDULE_MAX_CREATES_PER_APPLICATION_PER_DAY,
    15
  );

  const dayAgo = new Date(nowMs - 24 * 60 * 60_000);

  const [activeRows, recentCreateCount] = await Promise.all([
    prisma.interview.findMany({
      where: {
        applicationId,
        status: { in: ACTIVE_STATUSES },
      },
      select: { scheduledAt: true, durationMinutes: true },
    }),
    prisma.interview.count({
      where: {
        applicationId,
        createdAt: { gte: dayAgo },
      },
    }),
  ]);

  const activeUpcoming = activeRows.filter(
    (row) => interviewEndMs(row.scheduledAt, row.durationMinutes) > nowMs
  ).length;

  if (activeUpcoming >= maxActive) {
    return {
      code: "SCHEDULING_QUOTA_EXCEEDED",
      message: `This application already has the maximum of ${maxActive} active upcoming interview(s)`,
      status: 429,
      details: { maxActiveUpcoming: maxActive, current: activeUpcoming },
    };
  }

  if (recentCreateCount >= maxCreatesPerDay) {
    return {
      code: "SCHEDULING_QUOTA_EXCEEDED",
      message: `Interview create limit reached for this application (${maxCreatesPerDay} per 24 hours)`,
      status: 429,
      details: {
        maxCreatesPer24Hours: maxCreatesPerDay,
        current: recentCreateCount,
      },
    };
  }

  return null;
}

/**
 * Limits reschedule churn per interview (email/notification storms).
 */
export async function checkInterviewRescheduleQuota(
  interviewId: string,
  nowMs = Date.now()
): Promise<InterviewSchedulingQuotaError | null> {
  const maxReschedules = parsePositiveIntEnv(
    process.env.INTERVIEW_SCHEDULE_MAX_RESCHEDULES_PER_INTERVIEW_PER_DAY,
    10
  );
  const dayAgo = new Date(nowMs - 24 * 60 * 60_000);
  const recentReschedules = await prisma.interviewScheduleChange.count({
    where: {
      interviewId,
      changedAt: { gte: dayAgo },
    },
  });

  if (recentReschedules >= maxReschedules) {
    return {
      code: "SCHEDULING_QUOTA_EXCEEDED",
      message: `Reschedule limit reached for this interview (${maxReschedules} per 24 hours)`,
      status: 429,
      details: {
        maxReschedulesPer24Hours: maxReschedules,
        current: recentReschedules,
        interviewId,
      },
    };
  }

  return null;
}
