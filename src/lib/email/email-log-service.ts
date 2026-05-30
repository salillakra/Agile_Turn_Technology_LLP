import type { EmailDeliveryStatus, EmailLog, Prisma } from "@prisma/client";
import { recordEmailActivityForDelivery } from "@/src/lib/email/email-activity-log";
import type { EmailJobPayload, EmailTemplateKey } from "@/src/lib/queues/email-queue";
import { getEmailJobMaxAttempts } from "@/src/lib/queues/email-job-retry-options";
import { extractEmailJobPayload } from "@/src/lib/queues/workers/email-delivery-record";
import { isUnrecoverableError } from "@/src/lib/queues/workers/worker-errors";
import { prisma } from "@/src/lib/prisma";
import type { Job } from "bullmq";

const MAX_ERROR_LENGTH = 2000;

export type CreateEmailLogInput = {
  recipient: string;
  subject: string;
  template: EmailTemplateKey | string;
  bullmqJobId: string;
  applicationId?: string | null;
};

function truncateError(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= MAX_ERROR_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_ERROR_LENGTH - 3)}...`;
}

function applicationIdFromPayload(data: Record<string, unknown>): string | null {
  const raw = data.applicationId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Insert `PENDING` row when a message is queued (before worker send).
 */
export async function createEmailLogPending(
  input: CreateEmailLogInput
): Promise<EmailLog> {
  return prisma.emailLog.create({
    data: {
      recipient: input.recipient.trim().toLowerCase(),
      subject: input.subject.trim(),
      template: String(input.template).trim(),
      status: "PENDING",
      bullmqJobId: input.bullmqJobId,
      applicationId: input.applicationId ?? null,
    },
  });
}

export async function findEmailLogByBullmqJobId(
  bullmqJobId: string
): Promise<EmailLog | null> {
  return prisma.emailLog.findUnique({
    where: { bullmqJobId },
  });
}

/**
 * Mark delivery success (`SENT`, `sentAt`, optional SMTP `messageId`).
 */
export async function markEmailLogSent(params: {
  bullmqJobId: string;
  messageId?: string | null;
  sentAt?: Date;
  attemptCount?: number;
}): Promise<EmailLog | null> {
  const existing = await findEmailLogByBullmqJobId(params.bullmqJobId);
  if (!existing) return null;
  if (existing.status === "SENT") return existing;

  return prisma.emailLog.update({
    where: { id: existing.id },
    data: {
      status: "SENT",
      sentAt: params.sentAt ?? new Date(),
      messageId: params.messageId?.trim() || null,
      error: null,
      attemptCount: Math.max(1, params.attemptCount ?? 1),
    },
  });
}

/**
 * Mark permanent failure (`FAILED`, `error`). Leaves `sentAt` null.
 */
export async function markEmailLogFailed(params: {
  bullmqJobId: string;
  error: string;
  attemptCount?: number;
}): Promise<EmailLog | null> {
  const existing = await findEmailLogByBullmqJobId(params.bullmqJobId);
  if (!existing) return null;
  if (existing.status === "SENT") return existing;
  if (existing.status === "FAILED") return existing;

  const updated = await prisma.emailLog.update({
    where: { id: existing.id },
    data: {
      status: "FAILED",
      error: truncateError(params.error),
      attemptCount: Math.max(1, params.attemptCount ?? 1),
    },
  });
  return updated;
}

async function recordEmailLogAttempt(
  bullmqJobId: string,
  attemptCount: number
): Promise<void> {
  const existing = await findEmailLogByBullmqJobId(bullmqJobId);
  if (!existing || existing.status !== "PENDING") return;
  await prisma.emailLog.update({
    where: { id: existing.id },
    data: { attemptCount: Math.max(1, attemptCount) },
  });
}

/** Whether this attempt should persist `FAILED` (no more BullMQ retries). */
export function isEmailDeliveryFailureFinal(
  job: Job,
  error: unknown
): boolean {
  if (isUnrecoverableError(error)) return true;
  const maxAttempts = job.opts?.attempts ?? getEmailJobMaxAttempts();
  const attempt = job.attemptsMade + 1;
  return attempt >= maxAttempts;
}

export async function syncEmailLogAfterWorkerAttempt(params: {
  job: Job;
  error?: unknown;
  messageId?: string;
  skippedReason?: string;
}): Promise<void> {
  const jobId = params.job.id;
  if (!jobId) return;

  const attemptCount = params.job.attemptsMade + 1;
  let payload: EmailJobPayload | undefined;
  const getPayload = (): EmailJobPayload => {
    if (!payload) payload = extractEmailJobPayload(params.job.data);
    return payload;
  };

  if (params.skippedReason) {
    const prior = await findEmailLogByBullmqJobId(jobId);
    const log = await markEmailLogFailed({
      bullmqJobId: jobId,
      error: params.skippedReason,
      attemptCount,
    });
    if (log?.status === "FAILED" && prior?.status !== "FAILED" && prior?.status !== "SENT") {
      await recordEmailActivityForDelivery({
        job: params.job,
        payload: getPayload(),
        outcome: "failed",
        error: params.skippedReason,
      });
    }
    return;
  }

  if (params.messageId) {
    const prior = await findEmailLogByBullmqJobId(jobId);
    const log = await markEmailLogSent({
      bullmqJobId: jobId,
      messageId: params.messageId,
      attemptCount,
    });
    if (log?.status === "SENT" && prior?.status !== "SENT") {
      await recordEmailActivityForDelivery({
        job: params.job,
        payload: getPayload(),
        outcome: "sent",
      });
    }
    return;
  }

  await recordEmailLogAttempt(jobId, attemptCount);

  if (params.error != null && isEmailDeliveryFailureFinal(params.job, params.error)) {
    const message =
      params.error instanceof Error ? params.error.message : String(params.error);
    const prior = await findEmailLogByBullmqJobId(jobId);
    const log = await markEmailLogFailed({ bullmqJobId: jobId, error: message, attemptCount });
    if (log?.status === "FAILED" && prior?.status !== "FAILED" && prior?.status !== "SENT") {
      await recordEmailActivityForDelivery({
        job: params.job,
        payload: getPayload(),
        outcome: "failed",
        error: message,
      });
    }
  }
}

export async function recordEmailLogPendingForEnqueue(
  payload: EmailJobPayload,
  bullmqJobId: string
): Promise<void> {
  try {
    await createEmailLogPending({
      recipient: payload.recipient,
      subject: payload.subject,
      template: payload.template,
      bullmqJobId,
      applicationId: applicationIdFromPayload(payload.data),
    });
  } catch (err) {
    console.error(
      "[email-log] create PENDING failed bullmqJobId=%s",
      bullmqJobId,
      err instanceof Error ? err.message : err
    );
  }
}

export type ListEmailLogsFilter = {
  recipient?: string;
  status?: EmailDeliveryStatus;
  template?: string;
  applicationId?: string;
  createdAtGte?: Date;
  createdAtLt?: Date;
  limit?: number;
};

/**
 * Support / admin queries — newest first.
 */
export async function listEmailLogs(
  filter: ListEmailLogsFilter = {}
): Promise<EmailLog[]> {
  const where: Prisma.EmailLogWhereInput = {};
  if (filter.recipient?.trim()) {
    where.recipient = filter.recipient.trim().toLowerCase();
  }
  if (filter.status) where.status = filter.status;
  if (filter.template?.trim()) where.template = filter.template.trim();
  if (filter.applicationId?.trim()) {
    where.applicationId = filter.applicationId.trim();
  }
  if (filter.createdAtGte || filter.createdAtLt) {
    where.createdAt = {
      ...(filter.createdAtGte ? { gte: filter.createdAtGte } : {}),
      ...(filter.createdAtLt ? { lt: filter.createdAtLt } : {}),
    };
  }

  const take = Math.min(Math.max(filter.limit ?? 50, 1), 200);

  return prisma.emailLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });
}
