import { buildOfferLetterSubject } from "@/src/lib/application-stage-labels";
import { enqueueEmailJob } from "@/src/lib/queues/email-queue";
import { QueueEnqueueRateLimitedError } from "@/src/lib/queues/queue-enqueue-rate-limit";
import { isRedisConfigured } from "@/src/lib/queues/redis";

export type OfferSentEmailPayload = {
  candidateEmail: string;
  candidateName: string;
  applicationId: string;
  jobTitle: string;
  /** Free-text or structured offer summary for the template. */
  offerDetailsSummary?: string;
  /** Single string (newline/bullet) or list of next-step lines. */
  nextSteps?: string | string[];
  startDate?: string;
  compensation?: string;
  recruiterContact?: string;
};

/**
 * Enqueue `offer_sent` email (BullMQ). Worker sends asynchronously.
 */
export async function enqueueOfferSentEmail(
  payload: OfferSentEmailPayload
): Promise<void> {
  const recipient = payload.candidateEmail?.trim();
  if (!recipient || !isRedisConfigured()) return;

  const subject = buildOfferLetterSubject(payload.jobTitle);

  try {
    const enqueueResult = await enqueueEmailJob(
      {
        recipient,
        subject,
        template: "offer_sent",
        data: {
          candidateName: payload.candidateName,
          jobTitle: payload.jobTitle,
          applicationId: payload.applicationId,
          offerDetailsSummary: payload.offerDetailsSummary?.trim() ?? "",
          nextSteps: payload.nextSteps ?? [],
          startDate: payload.startDate?.trim() ?? "",
          compensation: payload.compensation?.trim() ?? "",
          recruiterContact: payload.recruiterContact?.trim() ?? "",
        },
      },
      { jobId: `email:offer:${payload.applicationId}` }
    );
    if (!enqueueResult.enqueued) {
      console.warn("[offer-sent] enqueue skipped (unexpected preference block)");
    }
  } catch (err) {
    if (err instanceof QueueEnqueueRateLimitedError) {
      console.warn(
        "[offer-sent] enqueue rate limited retryAfter=%ss",
        err.retryAfterSeconds
      );
    } else {
      console.error("[offer-sent] enqueue failed", err);
    }
  }
}
