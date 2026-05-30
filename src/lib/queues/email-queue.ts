/**
 * BullMQ queue for asynchronous transactional email.
 *
 * Producers: `enqueueEmailJob` (API routes, notification-service, interview reminders).
 * Consumers: `email-worker` → `processEmailJob` → `sendTransactionalEmail` / `sendEmail`.
 */

import { Queue, type QueueOptions } from "bullmq";
import { mergeEmailJobRetryOptions } from "@/src/lib/queues/email-job-retry-options";
import { assertQueueEnqueueRateLimit } from "@/src/lib/queues/queue-enqueue-rate-limit";
import { resolveJobDelayMs, type DelayedJobScheduleOptions } from "@/src/lib/queues/job-delay";
import { resolveEmailJobPriority } from "@/src/lib/queues/job-priority";
import { getQueueConnectionOptions } from "@/src/lib/queues/redis";
import { recordEmailLogPendingForEnqueue } from "@/src/lib/email/email-log-service";
import { canSendEmailToRecipient } from "@/src/lib/email/email-preference-service";
import { BULLMQ_QUEUE_NAMES } from "@/src/lib/queues/queue-names";
import { sanitizeBullmqJobId } from "@/src/lib/queues/bullmq-job-id";

/** Redis queue name for email workers (no `:` — BullMQ v5+ restriction). */
export const EMAIL_QUEUE_NAME = BULLMQ_QUEUE_NAMES.EMAIL;

/** BullMQ job name routed to the email processor. */
export const EMAIL_JOB_NAME = "email.transactional" as const;

/** Template keys rendered by the email worker (provider-specific). */
export type EmailTemplateKey =
  | "password_reset"
  | "offer_sent"
  | "interview_scheduled"
  | "interview_rescheduled"
  | "interview_cancelled"
  | "interview_panel_notice"
  | "interview_reminder"
  | "interview_reminder_interviewer"
  | "interview_notification"
  | "stage_changed"
  | "stage_update"
  | "candidate_stage_update"
  | "application_received"
  | (string & {});

/** Job data stored in Redis and passed to the worker processor. */
export type EmailJobPayload = {
  recipient: string;
  subject: string;
  template: EmailTemplateKey;
  /** Template variables (names, links, job title, etc.). */
  data: Record<string, unknown>;
};

export type EnqueueEmailJobResult =
  | { enqueued: true; jobId: string }
  | {
      enqueued: false;
      reason: "preference_opt_out";
      category: string;
    };

export type EnqueueEmailJobOptions = DelayedJobScheduleOptions & {
  /** Optional stable id for deduplication (e.g. `email:offer:{applicationId}`). */
  jobId?: string;
  /** Override template-derived priority (BullMQ: lower number = sooner). */
  priority?: number;
};

let queueInstance: Queue<EmailJobPayload> | null = null;

function emailQueueOptions(): QueueOptions {
  return {
    connection: getQueueConnectionOptions(),
    defaultJobOptions: mergeEmailJobRetryOptions({
      removeOnComplete: { age: 86_400, count: 1_000 },
    }),
  };
}

/** Lazily created BullMQ `Queue` for outbound email. */
export function getEmailQueue(): Queue<EmailJobPayload> {
  if (!queueInstance) {
    queueInstance = new Queue<EmailJobPayload>(EMAIL_QUEUE_NAME, emailQueueOptions());
  }
  return queueInstance;
}

function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase();
}

function defaultJobId(payload: EmailJobPayload): string {
  const slug = payload.template.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `email:${slug}:${normalizeRecipient(payload.recipient)}`;
}

/**
 * Enqueue a transactional email job.
 * Respects {@link EmailPreference} for stage updates, interview reminders, and marketing.
 * Does not send mail — worker consumes the queue later.
 */
export async function enqueueEmailJob(
  payload: EmailJobPayload,
  options?: EnqueueEmailJobOptions
): Promise<EnqueueEmailJobResult> {
  if (!payload.recipient?.trim()) {
    throw new Error("enqueueEmailJob: recipient is required");
  }
  if (!payload.subject?.trim()) {
    throw new Error("enqueueEmailJob: subject is required");
  }
  if (!payload.template?.trim()) {
    throw new Error("enqueueEmailJob: template is required");
  }
  if (payload.data == null || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    throw new Error("enqueueEmailJob: data must be a plain object");
  }

  await assertQueueEnqueueRateLimit("email");

  const normalized: EmailJobPayload = {
    recipient: normalizeRecipient(payload.recipient),
    subject: payload.subject.trim(),
    template: payload.template.trim() as EmailTemplateKey,
    data: payload.data,
  };

  const sendCheck = await canSendEmailToRecipient({
    recipient: normalized.recipient,
    template: normalized.template,
  });
  if (!sendCheck.allowed) {
    console.info(
      "[email] enqueue skipped preference_opt_out category=%s recipient=%s template=%s",
      sendCheck.category,
      normalized.recipient,
      normalized.template
    );
    return {
      enqueued: false,
      reason: "preference_opt_out",
      category: sendCheck.category,
    };
  }

  const job = await getEmailQueue().add(
    EMAIL_JOB_NAME,
    normalized,
    mergeEmailJobRetryOptions({
      jobId: sanitizeBullmqJobId(options?.jobId ?? defaultJobId(normalized)),
      delay: resolveJobDelayMs(options),
      priority:
        options?.priority ??
        resolveEmailJobPriority(normalized.template, normalized.data),
    })
  );

  if (!job.id) {
    throw new Error("enqueueEmailJob: BullMQ did not return a job id");
  }

  await recordEmailLogPendingForEnqueue(normalized, job.id);

  return { enqueued: true, jobId: job.id };
}

/** Returns BullMQ job id or `null` when blocked by preferences. */
export async function enqueueEmailJobId(
  payload: EmailJobPayload,
  options?: EnqueueEmailJobOptions
): Promise<string | null> {
  const result = await enqueueEmailJob(payload, options);
  return result.enqueued ? result.jobId : null;
}

/** Central export — queue metadata + enqueue helper (no sending logic). */
export const emailQueue = {
  name: EMAIL_QUEUE_NAME,
  jobName: EMAIL_JOB_NAME,
  get instance() {
    return getEmailQueue();
  },
  enqueue: enqueueEmailJob,
} as const;

export async function closeEmailQueue(): Promise<void> {
  if (!queueInstance) return;
  const q = queueInstance;
  queueInstance = null;
  await q.close();
}
