import { buildInterviewScheduledSubject } from "@/src/lib/application-stage-labels";
import { enqueueEmailJob } from "@/src/lib/queues/email-queue";
import { QueueEnqueueRateLimitedError } from "@/src/lib/queues/queue-enqueue-rate-limit";
import { isRedisConfigured } from "@/src/lib/queues/redis";
import { resolveJobInterviewerNames } from "@/src/lib/resolve-job-interviewers";

export type InterviewScheduledEmailPayload = {
  /** When set, BullMQ jobId is scoped per interview (not per application). */
  interviewId?: string;
  applicationId: string;
  jobId: string;
  recipient: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: Date;
  /** Overrides job assignment lookup when provided. */
  interviewer?: string;
  meetingLink?: string;
  timeZone?: string;
};

/**
 * Enqueue `interview_scheduled` email (BullMQ). Worker sends asynchronously.
 */
export async function enqueueInterviewScheduledEmail(
  payload: InterviewScheduledEmailPayload
): Promise<void> {
  const recipient = payload.recipient?.trim();
  if (!recipient || !isRedisConfigured()) return;

  const interviewAt = payload.interviewDate;
  if (!(interviewAt instanceof Date) || Number.isNaN(interviewAt.getTime())) {
    throw new Error("enqueueInterviewScheduledEmail: interviewDate must be a valid Date");
  }

  const interviewer =
    payload.interviewer?.trim() ||
    (await resolveJobInterviewerNames(payload.jobId)) ||
    "Your recruiting team";

  const subject = buildInterviewScheduledSubject(payload.jobTitle);

  try {
    const enqueueResult = await enqueueEmailJob(
      {
        recipient,
        subject,
        template: "interview_scheduled",
        data: {
          candidateName: payload.candidateName,
          jobTitle: payload.jobTitle,
          interviewDate: interviewAt.toISOString(),
          interviewer,
          meetingLink: payload.meetingLink?.trim() ?? "",
          applicationId: payload.applicationId,
          ...(payload.timeZone ? { timeZone: payload.timeZone } : {}),
        },
      },
      {
        jobId: payload.interviewId
          ? `email:interview-scheduled:iv:${payload.interviewId}:candidate`
          : `email:interview-scheduled:${payload.applicationId}`,
      }
    );
    if (!enqueueResult.enqueued) {
      console.warn(
        "[interview-scheduled] enqueue skipped (unexpected preference block)"
      );
    }
  } catch (err) {
    if (err instanceof QueueEnqueueRateLimitedError) {
      console.warn(
        "[interview-scheduled] enqueue rate limited retryAfter=%ss",
        err.retryAfterSeconds
      );
    } else {
      console.error("[interview-scheduled] enqueue failed", err);
    }
  }
}
