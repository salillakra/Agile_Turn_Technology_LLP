import { buildInterviewRescheduledSubject } from "@/src/lib/application-stage-labels";
import { enqueueEmailJob } from "@/src/lib/queues/email-queue";
import { QueueEnqueueRateLimitedError } from "@/src/lib/queues/queue-enqueue-rate-limit";
import { isRedisConfigured } from "@/src/lib/queues/redis";

export type InterviewRescheduledEmailPayload = {
  interviewId: string;
  applicationId: string;
  recipient: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: Date;
  previousInterviewDate: Date;
  interviewer?: string;
  meetingLink?: string;
  timeZone?: string;
};

export async function enqueueInterviewRescheduledEmail(
  payload: InterviewRescheduledEmailPayload
): Promise<void> {
  const recipient = payload.recipient?.trim();
  if (!recipient || !isRedisConfigured()) return;

  const interviewAt = payload.interviewDate;
  const previousAt = payload.previousInterviewDate;
  if (!(interviewAt instanceof Date) || Number.isNaN(interviewAt.getTime())) {
    throw new Error("enqueueInterviewRescheduledEmail: interviewDate must be a valid Date");
  }
  if (!(previousAt instanceof Date) || Number.isNaN(previousAt.getTime())) {
    throw new Error(
      "enqueueInterviewRescheduledEmail: previousInterviewDate must be a valid Date"
    );
  }

  const interviewer = payload.interviewer?.trim() || "Your recruiting team";
  const subject = buildInterviewRescheduledSubject(payload.jobTitle);

  try {
    const enqueueResult = await enqueueEmailJob(
      {
        recipient,
        subject,
        template: "interview_rescheduled",
        data: {
          candidateName: payload.candidateName,
          jobTitle: payload.jobTitle,
          interviewDate: interviewAt.toISOString(),
          previousInterviewDate: previousAt.toISOString(),
          interviewer,
          meetingLink: payload.meetingLink?.trim() ?? "",
          applicationId: payload.applicationId,
          ...(payload.timeZone ? { timeZone: payload.timeZone } : {}),
        },
      },
      { jobId: `email:interview-rescheduled:iv:${payload.interviewId}:candidate` }
    );
    if (!enqueueResult.enqueued) {
      console.warn("[interview-rescheduled] enqueue skipped (unexpected preference block)");
    }
  } catch (err) {
    if (err instanceof QueueEnqueueRateLimitedError) {
      console.warn(
        "[interview-rescheduled] enqueue rate limited retryAfter=%ss",
        err.retryAfterSeconds
      );
    } else {
      console.error("[interview-rescheduled] enqueue failed", err);
    }
  }
}
