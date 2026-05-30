import type { Job } from "bullmq";
import type { EmailJobPayload } from "@/src/lib/queues/email-queue";
import {
  readQueueJobFailureMeta,
  serializeJobError,
} from "@/src/lib/queues/workers/job-failure-record";

export const EMAIL_DELIVERY_KEY = "__emailDelivery" as const;
export const EMAIL_FAILURE_HISTORY_KEY = "__emailFailureHistory" as const;
const QUEUE_FAILURE_KEY = "__queueFailure" as const;

export type EmailDeliveryRecord = {
  status: "sent";
  messageId: string;
  sentAt: string;
  attempt: number;
};

export type EmailFailureAttempt = {
  attempt: number;
  failedAt: string;
  message: string;
  name: string;
  unrecoverable: boolean;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

export function readEmailDeliveryRecord(data: unknown): EmailDeliveryRecord | null {
  const o = asRecord(data);
  if (!o) return null;
  const raw = o[EMAIL_DELIVERY_KEY];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (d.status !== "sent" || typeof d.messageId !== "string") return null;
  return raw as EmailDeliveryRecord;
}

export function readEmailFailureHistory(data: unknown): EmailFailureAttempt[] {
  const o = asRecord(data);
  if (!o) return [];
  const raw = o[EMAIL_FAILURE_HISTORY_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is EmailFailureAttempt =>
      item != null &&
      typeof item === "object" &&
      typeof (item as EmailFailureAttempt).attempt === "number" &&
      typeof (item as EmailFailureAttempt).message === "string"
  );
}

/** True when SMTP already succeeded for this BullMQ job (skip resend on retry). */
export function isEmailAlreadyDelivered(data: unknown): boolean {
  const delivery = readEmailDeliveryRecord(data);
  return delivery != null && delivery.messageId.length > 0;
}

/** Strip worker metadata before template render / SMTP. */
export function extractEmailJobPayload(jobData: unknown): EmailJobPayload {
  const o = asRecord(jobData);
  if (!o) {
    throw new Error("extractEmailJobPayload: job data must be an object");
  }

  const recipient = typeof o.recipient === "string" ? o.recipient.trim() : "";
  const subject = typeof o.subject === "string" ? o.subject.trim() : "";
  const template = typeof o.template === "string" ? o.template.trim() : "";
  const templateData = o.data;

  if (!recipient || !subject || !template) {
    throw new Error("extractEmailJobPayload: recipient, subject, and template are required");
  }
  if (
    templateData == null ||
    typeof templateData !== "object" ||
    Array.isArray(templateData)
  ) {
    throw new Error("extractEmailJobPayload: data must be a plain object");
  }

  return {
    recipient,
    subject,
    template: template as EmailJobPayload["template"],
    data: templateData as Record<string, unknown>,
  };
}

async function mergeJobData(
  job: Job<EmailJobPayload>,
  patch: Record<string, unknown>
): Promise<void> {
  const base = asRecord(job.data) ?? {};
  await job.updateData({ ...base, ...patch } as EmailJobPayload);
}

/**
 * Persist successful delivery on the job so BullMQ retries do not resend.
 */
export async function recordEmailDeliverySuccess(
  job: Job<EmailJobPayload>,
  messageId: string,
  attempt: number
): Promise<void> {
  const delivery: EmailDeliveryRecord = {
    status: "sent",
    messageId,
    sentAt: new Date().toISOString(),
    attempt,
  };

  const patch: Record<string, unknown> = {
    [EMAIL_DELIVERY_KEY]: delivery,
  };

  const base = asRecord(job.data);
  if (base && QUEUE_FAILURE_KEY in base) {
    const next = { ...base };
    delete next[QUEUE_FAILURE_KEY];
    await job.updateData({ ...next, ...patch } as EmailJobPayload);
    return;
  }

  await mergeJobData(job, patch);
}

/**
 * Append a failed attempt to job data for ops / activity logs (alongside {@link recordJobAttemptFailure}).
 */
export async function appendEmailFailureAttempt(
  job: Job<EmailJobPayload>,
  error: unknown,
  attempt: number
): Promise<EmailFailureAttempt> {
  const serialized = serializeJobError(error);
  const entry: EmailFailureAttempt = {
    attempt,
    failedAt: new Date().toISOString(),
    message: serialized.message,
    name: serialized.name,
    unrecoverable: serialized.unrecoverable,
  };

  const history = [...readEmailFailureHistory(job.data), entry];
  await mergeJobData(job, { [EMAIL_FAILURE_HISTORY_KEY]: history });

  try {
    await job.log(
      `email attempt ${attempt} failed (${serialized.name}): ${serialized.message}`
    );
  } catch {
    /* ignore */
  }

  return entry;
}

export function summarizeEmailJobFailures(job: Job<EmailJobPayload>): {
  lastFailure: string | null;
  failureCount: number;
  delivered: boolean;
  messageId: string | null;
} {
  const delivery = readEmailDeliveryRecord(job.data);
  const history = readEmailFailureHistory(job.data);
  const meta = readQueueJobFailureMeta(job.data);
  return {
    delivered: delivery != null,
    messageId: delivery?.messageId ?? null,
    failureCount: history.length,
    lastFailure: meta?.message ?? history.at(-1)?.message ?? null,
  };
}
