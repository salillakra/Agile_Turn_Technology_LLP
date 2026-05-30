import { buildInterviewCancelledSubject } from "@/src/lib/application-stage-labels";
import { enqueueEmailJob } from "@/src/lib/queues/email-queue";
import { QueueEnqueueRateLimitedError } from "@/src/lib/queues/queue-enqueue-rate-limit";
import { isRedisConfigured } from "@/src/lib/queues/redis";
import { resolveJobInterviewerNames } from "@/src/lib/resolve-job-interviewers";

export type InterviewCancelledEmailPayload = {
  interviewId?: string;
  applicationId: string;
  jobId: string;
  recipient: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: Date;
  cancellationReason?: string;
  interviewer?: string;
  timeZone?: string;
};

export async function enqueueInterviewCancelledEmail(
  payload: InterviewCancelledEmailPayload
): Promise<void> {
  const recipient = payload.recipient?.trim();
  if (!recipient || !isRedisConfigured()) return;

  const interviewAt = payload.interviewDate;
  if (!(interviewAt instanceof Date) || Number.isNaN(interviewAt.getTime())) {
    throw new Error("enqueueInterviewCancelledEmail: interviewDate must be a valid Date");
  }

  const interviewer =
    payload.interviewer?.trim() ||
    (await resolveJobInterviewerNames(payload.jobId)) ||
    "Your recruiting team";

  const subject = buildInterviewCancelledSubject(payload.jobTitle);

  try {
    const enqueueResult = await enqueueEmailJob(
      {
        recipient,
        subject,
        template: "interview_cancelled",
        data: {
          candidateName: payload.candidateName,
          jobTitle: payload.jobTitle,
          interviewDate: interviewAt.toISOString(),
          interviewer,
          cancellationReason: payload.cancellationReason?.trim() ?? "",
          applicationId: payload.applicationId,
          ...(payload.timeZone ? { timeZone: payload.timeZone } : {}),
        },
      },
      {
        jobId: payload.interviewId
          ? `email:interview-cancelled:iv:${payload.interviewId}:candidate`
          : `email:interview-cancelled:${payload.applicationId}:${Date.now()}`,
      }
    );
    if (!enqueueResult.enqueued) {
      console.warn("[interview-cancelled] enqueue skipped (unexpected preference block)");
    }
  } catch (err) {
    if (err instanceof QueueEnqueueRateLimitedError) {
      console.warn(
        "[interview-cancelled] enqueue rate limited retryAfter=%ss",
        err.retryAfterSeconds
      );
    } else {
      console.error("[interview-cancelled] enqueue failed", err);
    }
  }
}
