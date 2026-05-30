import { prisma } from "@/src/lib/prisma";
import {
  ACTIVITY_ACTION_FEEDBACK_SUBMITTED,
  ACTIVITY_ACTION_INTERVIEW_CANCELLED,
  ACTIVITY_ACTION_INTERVIEW_RESCHEDULED,
  ACTIVITY_ACTION_INTERVIEW_SCHEDULED,
  buildInterviewCancelledDetails,
  buildInterviewFeedbackSubmittedDetails,
  buildInterviewRescheduledDetails,
  buildInterviewScheduledDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import { isValidCuid } from "@/src/lib/validate-id";

type WriteInterviewActivityLogParams = {
  action: string;
  applicationId: string;
  candidateId: string;
  interviewId: string;
  /** Set for feedback events (`reviewerId`); null for panel-wide schedule/reschedule/cancel. */
  interviewerId: string | null;
  userId: string | undefined;
  details: unknown;
};

async function writeInterviewActivityLog(params: WriteInterviewActivityLogParams): Promise<void> {
  const applicationId = params.applicationId.trim();
  const candidateId = params.candidateId.trim();
  const interviewId = params.interviewId.trim();
  if (!isValidCuid(applicationId) || !isValidCuid(candidateId) || !isValidCuid(interviewId)) {
    return;
  }
  if (params.interviewerId != null && !isValidCuid(params.interviewerId)) {
    return;
  }

  const serialized = serializeActivityLogDetails(params.details);
  if (!serialized.ok) return;

  await prisma.activityLog.create({
    data: {
      applicationId,
      candidateId,
      interviewId,
      interviewerId: params.interviewerId,
      userId: params.userId ?? null,
      action: params.action,
      details: serialized.json,
    },
  });
}

export async function logInterviewScheduled(params: {
  interviewId: string;
  applicationId: string;
  candidateId: string;
  userId: string | undefined;
  scheduledAt: Date;
  durationMinutes: number;
  interviewerUserIds: readonly string[];
}): Promise<void> {
  const detailsObj = buildInterviewScheduledDetails({
    interviewId: params.interviewId,
    applicationId: params.applicationId,
    scheduledAt: params.scheduledAt,
    durationMinutes: params.durationMinutes,
    interviewerUserIds: params.interviewerUserIds,
  });

  await writeInterviewActivityLog({
    action: ACTIVITY_ACTION_INTERVIEW_SCHEDULED,
    applicationId: params.applicationId,
    candidateId: params.candidateId,
    interviewId: params.interviewId,
    interviewerId: null,
    userId: params.userId,
    details: detailsObj,
  });
}

export async function logInterviewRescheduled(params: {
  interviewId: string;
  applicationId: string;
  candidateId: string;
  userId: string | undefined;
  fromScheduledAt: Date;
  toScheduledAt: Date;
  fromDurationMinutes: number;
  toDurationMinutes: number;
}): Promise<void> {
  const detailsObj = buildInterviewRescheduledDetails({
    interviewId: params.interviewId,
    applicationId: params.applicationId,
    fromScheduledAt: params.fromScheduledAt,
    toScheduledAt: params.toScheduledAt,
    fromDurationMinutes: params.fromDurationMinutes,
    toDurationMinutes: params.toDurationMinutes,
  });

  await writeInterviewActivityLog({
    action: ACTIVITY_ACTION_INTERVIEW_RESCHEDULED,
    applicationId: params.applicationId,
    candidateId: params.candidateId,
    interviewId: params.interviewId,
    interviewerId: null,
    userId: params.userId,
    details: detailsObj,
  });
}

export async function logInterviewCancelled(params: {
  interviewId: string;
  applicationId: string;
  candidateId: string;
  userId: string | undefined;
  previousStatus: string;
  scheduledAt: Date;
  durationMinutes: number;
  reason: string;
}): Promise<void> {
  const detailsObj = buildInterviewCancelledDetails({
    interviewId: params.interviewId,
    applicationId: params.applicationId,
    previousStatus: params.previousStatus,
    scheduledAt: params.scheduledAt,
    durationMinutes: params.durationMinutes,
    reason: params.reason,
  });

  await writeInterviewActivityLog({
    action: ACTIVITY_ACTION_INTERVIEW_CANCELLED,
    applicationId: params.applicationId,
    candidateId: params.candidateId,
    interviewId: params.interviewId,
    interviewerId: null,
    userId: params.userId,
    details: detailsObj,
  });
}

export async function logInterviewFeedbackSubmitted(params: {
  interviewId: string;
  applicationId: string;
  candidateId: string;
  reviewerId: string;
  userId: string | undefined;
  rating: number | null;
  recommendation: string;
}): Promise<void> {
  const reviewerId = params.reviewerId.trim();
  const detailsObj = buildInterviewFeedbackSubmittedDetails({
    interviewId: params.interviewId,
    applicationId: params.applicationId,
    reviewerId,
    rating: params.rating,
    recommendation: params.recommendation,
  });

  await writeInterviewActivityLog({
    action: ACTIVITY_ACTION_FEEDBACK_SUBMITTED,
    applicationId: params.applicationId,
    candidateId: params.candidateId,
    interviewId: params.interviewId,
    interviewerId: reviewerId,
    userId: params.userId,
    details: detailsObj,
  });
}
