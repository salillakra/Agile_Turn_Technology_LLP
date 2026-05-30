import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import {
  detectInterviewerSchedulingConflicts,
  formatSchedulingConflictMessage,
} from "@/src/lib/interview-scheduling-conflicts";
import { checkInterviewRescheduleQuota } from "@/src/lib/interview-scheduling-abuse";
import { checkInterviewSchedulingRateLimit } from "@/src/lib/interview-scheduling-rate-limit";
import {
  resolveInterviewMeetingLinkForPatch,
  validateInterviewScheduleInput,
} from "@/src/lib/interview-scheduling-validation";
import { createNotification } from "@/src/lib/notification-service";
import { logInterviewRescheduled } from "@/src/lib/interview-activity-log";
import { scheduleInterviewRescheduledCommunications } from "@/src/lib/interview-email-orchestration";

export const runtime = "nodejs";

/**
 * PATCH /api/interviews/[id]/reschedule
 *
 * Behavior:
 * 1. Update interview time (scheduledAt, durationMinutes, meetingLink optional).
 * 2. Track previous schedule (InterviewScheduleChange row).
 * 3. Notify candidate + interviewers (async / best-effort).
 * 4. Log activity (ActivityLog INTERVIEW_RESCHEDULED).
 *
 * Input:
 * - scheduledAt (ISO string, required)
 * - durationMinutes (int, required)
 * - meetingLink (optional)
 *
 * Protection: per-user rate limit, future-only window, duration bounds, meeting link validation,
 * interviewer conflicts, per-interview reschedule quota (see interview-scheduling-* libs).
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const actorUserId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const rateLimited = await checkInterviewSchedulingRateLimit(actorUserId);
  if (rateLimited) return rateLimited;

  const { id } = await context.params;
  const interviewId = typeof id === "string" ? id.trim() : "";
  if (!interviewId || !isValidCuid(interviewId)) {
    return apiError("INVALID_ID", "Malformed interview id", 400);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      applicationId: true,
      application: {
        select: {
          id: true,
          jobId: true,
          candidateId: true,
          candidate: { select: { candidateName: true, email: true } },
          job: { select: { title: true } },
        },
      },
      scheduledAt: true,
      durationMinutes: true,
      meetingLink: true,
      status: true,
      interviewers: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!interview || !interview.application) {
    return apiError("NOT_FOUND", "Interview not found", 404);
  }

  if (!(await canAccessJobByScope(role, actorUserId, interview.application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this interview", 403);
  }

  if (!actorUserId) {
    return apiError("UNAUTHORIZED", "Missing user session", 401);
  }

  if (interview.status === "CANCELLED") {
    return apiError("INVALID_STATE", "Cancelled interviews cannot be rescheduled", 409);
  }

  if (interview.status === "COMPLETED") {
    return apiError("INVALID_STATE", "Completed interviews cannot be rescheduled", 409);
  }

  const hasMeetingLinkKey = Object.prototype.hasOwnProperty.call(body, "meetingLink");
  const meetingLinkInput = hasMeetingLinkKey ? body.meetingLink : (interview.meetingLink ?? null);

  const scheduleValidated = validateInterviewScheduleInput({
    scheduledAt: body.scheduledAt,
    durationMinutes: body.durationMinutes,
    meetingLink: meetingLinkInput,
  });
  if (scheduleValidated.ok === false) {
    return apiError(
      scheduleValidated.error.code,
      scheduleValidated.error.message,
      scheduleValidated.error.status,
      scheduleValidated.error.details
    );
  }

  const { scheduledAt, durationMinutes } = scheduleValidated.value;
  const meetingLink = scheduleValidated.value.meetingLink;

  const rescheduleQuotaError = await checkInterviewRescheduleQuota(interviewId);
  if (rescheduleQuotaError) {
    return apiError(
      rescheduleQuotaError.code,
      rescheduleQuotaError.message,
      rescheduleQuotaError.status,
      rescheduleQuotaError.details
    );
  }

  const fromScheduledAt = interview.scheduledAt;
  const fromDurationMinutes = interview.durationMinutes;

  const sameSchedule =
    fromScheduledAt.getTime() === scheduledAt.getTime() &&
    fromDurationMinutes === durationMinutes &&
    (interview.meetingLink ?? null) === meetingLink;

  if (sameSchedule) {
    return apiError("NO_CHANGE", "Schedule is unchanged", 409);
  }

  const interviewerUserIds = interview.interviewers.map((i) => i.userId);
  const conflicts = await detectInterviewerSchedulingConflicts({
    interviewerUserIds,
    scheduledAt,
    durationMinutes,
    excludeInterviewId: interviewId,
  });
  if (conflicts.length > 0) {
    return apiError("SCHEDULING_CONFLICT", formatSchedulingConflictMessage(conflicts), 409, {
      conflicts,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.interviewScheduleChange.create({
      data: {
        interviewId,
        fromScheduledAt: interview.scheduledAt,
        toScheduledAt: scheduledAt,
        fromDurationMinutes: interview.durationMinutes,
        toDurationMinutes: durationMinutes,
        changedBy: actorUserId,
      },
    });

    return tx.interview.update({
      where: { id: interviewId },
      data: {
        scheduledAt,
        durationMinutes,
        meetingLink,
        status: "RESCHEDULED",
      },
      include: {
        interviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
        scheduleHistory: { orderBy: { changedAt: "desc" }, take: 10 },
      },
    });
  });

  // ActivityLog (best-effort; non-blocking).
  void logInterviewRescheduled({
    interviewId,
    applicationId: interview.applicationId,
    candidateId: interview.application.candidateId,
    userId: actorUserId,
    fromScheduledAt,
    toScheduledAt: scheduledAt,
    fromDurationMinutes,
    toDurationMinutes: durationMinutes,
  });

  // In-app notifications to interviewers (best-effort).
  for (const i of interview.interviewers) {
    void createNotification(
      i.userId,
      "INTERVIEW_SCHEDULED",
      "Interview rescheduled",
      `Interview was rescheduled to ${scheduledAt.toISOString()} (${durationMinutes} min).`,
      "HIGH",
      { type: "APPLICATION", id: interview.applicationId }
    );
  }

  scheduleInterviewRescheduledCommunications(interviewId, {
    previousScheduledAt: fromScheduledAt,
  });

  return NextResponse.json(updated);
}

