import {
  sendTransactionalEmail,
  shouldSkipEmailSend,
} from "@/src/lib/email/send-email";
import { syncEmailLogAfterWorkerAttempt } from "@/src/lib/email/email-log-service";
import { assertOutboundEmailSendRateLimit } from "@/src/lib/queues/email-outbound-rate-limit";
import { RateLimitError } from "bullmq";
import { isSmtpConfigured } from "@/src/lib/email/transporter";
import type { EmailJobPayload } from "@/src/lib/queues/email-queue";
import {
  appendEmailFailureAttempt,
  extractEmailJobPayload,
  isEmailAlreadyDelivered,
  readEmailDeliveryRecord,
  recordEmailDeliverySuccess,
} from "@/src/lib/queues/workers/email-delivery-record";
import type { Job } from "bullmq";

/**
 * BullMQ processor for `emailQueue`.
 * Retries: queue `mergeEmailJobRetryOptions` (exponential backoff).
 * Idempotency: skips SMTP when {@link recordEmailDeliverySuccess} is already set on the job.
 * Observability: `EmailLog` rows (PENDING → SENT | FAILED).
 */
export async function processEmailJob(job: Job<EmailJobPayload>): Promise<void> {
  const attempt = job.attemptsMade + 1;

  if (shouldSkipEmailSend()) {
    const reason = isSmtpConfigured()
      ? "EMAIL_SEND_ENABLED is not set"
      : "SMTP not configured (SMTP_HOST, SMTP_FROM)";

    const skipped = extractEmailJobPayload(job.data);
    console.info(
      "[emailWorker] skipped send (%s) job=%s template=%s recipient=%s attempt=%s",
      reason,
      job.id,
      skipped.template,
      skipped.recipient,
      attempt
    );
    await syncEmailLogAfterWorkerAttempt({ job, skippedReason: reason });
    return;
  }

  if (isEmailAlreadyDelivered(job.data)) {
    const prior = readEmailDeliveryRecord(job.data)!;
    console.info(
      "[emailWorker] duplicate retry skipped job=%s messageId=%s priorAttempt=%s currentAttempt=%s",
      job.id,
      prior.messageId,
      prior.attempt,
      attempt
    );
    await syncEmailLogAfterWorkerAttempt({ job, messageId: prior.messageId });
    return;
  }

  const payload = extractEmailJobPayload(job.data);

  try {
    await assertOutboundEmailSendRateLimit(payload.recipient);
  } catch (rateErr) {
    if (rateErr instanceof RateLimitError) {
      console.warn(
        "[emailWorker] outbound rate limited job=%s recipient=%s — re-queued (not a failed attempt)",
        job.id,
        payload.recipient
      );
      try {
        await job.log(
          "outbound rate limited; deferred (SMTP reputation / anti-spam guard)"
        );
      } catch {
        /* ignore */
      }
    }
    throw rateErr;
  }

  try {
    const result = await sendTransactionalEmail(payload);
    await recordEmailDeliverySuccess(job, result.messageId, attempt);
    await syncEmailLogAfterWorkerAttempt({ job, messageId: result.messageId });

    console.info(
      "[emailWorker] sent job=%s template=%s recipient=%s messageId=%s attempt=%s",
      job.id,
      payload.template,
      payload.recipient,
      result.messageId,
      attempt
    );
  } catch (error) {
    await appendEmailFailureAttempt(job, error, attempt);
    await syncEmailLogAfterWorkerAttempt({ job, error });
    throw error;
  }
}
