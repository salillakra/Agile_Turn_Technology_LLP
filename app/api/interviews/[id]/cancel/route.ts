import { NextResponse } from "next/server";
import type { InterviewStatus } from "@prisma/client";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { createNotification } from "@/src/lib/notification-service";
import { logInterviewCancelled } from "@/src/lib/interview-activity-log";
import { MAX_INTERVIEW_CANCELLATION_REASON_LENGTH } from "@/src/lib/activity-log-details";
import { scheduleInterviewCancelledCommunications } from "@/src/lib/interview-email-orchestration";
import { checkInterviewSchedulingRateLimit } from "@/src/lib/interview-scheduling-rate-limit";

export const runtime = "nodejs";

const CANCELLABLE_STATUSES: InterviewStatus[] = ["SCHEDULED", "RESCHEDULED"];

/**
 * PATCH /api/interviews/[id]/cancel
 *
 * Soft-cancel an interview (no hard delete):
 * 1. Set status to CANCELLED.
 * 2. Persist immutable InterviewCancellation with reason.
 * 3. Notify candidate + assigned interviewers.
 * 4. Log ActivityLog INTERVIEW_CANCELLED.
 *
 * Input:
 * - reason (string, required)
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
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return apiError("VALIDATION_ERROR", "reason is required", 400);
  }
  if (reason.length > MAX_INTERVIEW_CANCELLATION_REASON_LENGTH) {
    return apiError(
      "TEXT_LIMIT_EXCEEDED",
      `reason exceeds maximum length (${MAX_INTERVIEW_CANCELLATION_REASON_LENGTH})`,
      400
    );
  }

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      applicationId: true,
      title: true,
      scheduledAt: true,
      durationMinutes: true,
      meetingLink: true,
      status: true,
      createdBy: true,
      cancellation: { select: { id: true } },
      application: {
        select: {
          id: true,
          jobId: true,
          candidateId: true,
          candidate: { select: { candidateName: true, email: true } },
          job: { select: { title: true } },
        },
      },
      interviewers: {
        select: { userId: true, user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!interview || !interview.application) {
    return apiError("NOT_FOUND", "Interview not found", 404);
  }

  if (!actorUserId) {
    return apiError("UNAUTHORIZED", "Missing user session", 401);
  }

  if (!(await canAccessJobByScope(role, actorUserId, interview.application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this interview", 403);
  }

  if (interview.status === "CANCELLED" || interview.cancellation) {
    return apiError("ALREADY_CANCELLED", "Interview is already cancelled", 409);
  }

  if (!CANCELLABLE_STATUSES.includes(interview.status)) {
    return apiError(
      "INVALID_STATE",
      `Interview in status ${interview.status} cannot be cancelled`,
      409,
      { status: interview.status }
    );
  }

  const previousStatus = interview.status;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.interviewCancellation.create({
      data: {
        interviewId,
        reason,
        previousStatus,
        scheduledAt: interview.scheduledAt,
        durationMinutes: interview.durationMinutes,
        cancelledBy: actorUserId,
      },
    });

    return tx.interview.update({
      where: { id: interviewId },
      data: { status: "CANCELLED" },
      include: {
        cancellation: true,
        interviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
        scheduleHistory: { orderBy: { changedAt: "desc" }, take: 10 },
      },
    });
  });

  void logInterviewCancelled({
    interviewId,
    applicationId: interview.applicationId,
    candidateId: interview.application.candidateId,
    userId: actorUserId,
    previousStatus,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    reason,
  });

  const jobTitle = interview.application.job.title;
  const notifyMessage = `Interview for ${jobTitle} was cancelled. Reason: ${reason}`;

  const stakeholderUserIds = new Set(interview.interviewers.map((i) => i.userId));
  stakeholderUserIds.add(interview.createdBy);

  for (const userId of stakeholderUserIds) {
    void createNotification(
      userId,
      "INTERVIEW_SCHEDULED",
      "Interview cancelled",
      notifyMessage,
      "HIGH",
      { type: "APPLICATION", id: interview.applicationId }
    );
  }

  scheduleInterviewCancelledCommunications(interviewId, { cancellationReason: reason });

  return NextResponse.json(updated);
}
