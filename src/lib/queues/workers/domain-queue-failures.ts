import type { Job } from "bullmq";
import { RESUME_PARSING_QUEUE_NAME } from "@/src/lib/queues/resume-parsing-queue";
import type { ResumeParsingJobPayload } from "@/src/lib/queues/resume-parsing-queue";
import { EMBEDDING_QUEUE_NAME } from "@/src/lib/queues/embedding-queue";
import type { EmbeddingJobPayload } from "@/src/lib/queues/embedding-queue";
import { EMAIL_QUEUE_NAME } from "@/src/lib/queues/email-queue";
import type { EmailJobPayload } from "@/src/lib/queues/email-queue";
import { markEmailLogFailed } from "@/src/lib/email/email-log-service";
import {
  extractEmailJobPayload,
  readEmailFailureHistory,
  summarizeEmailJobFailures,
} from "@/src/lib/queues/workers/email-delivery-record";
import {
  readQueueJobFailureMeta,
  type QueueJobFailureMeta,
  type SerializedJobError,
} from "@/src/lib/queues/workers/job-failure-record";
import { serializeActivityLogDetails } from "@/src/lib/activity-log-details";
import { markEmbeddingJobFailed } from "@/src/lib/embedding-job-status";
import { failResumeParseJobAndLog } from "@/src/lib/resume-parse-activity-log";
import { prisma } from "@/src/lib/prisma";
import { computeResumeSha256HexFromResumeUrl } from "@/src/lib/resume-file-hash";

export const ACTIVITY_ACTION_QUEUE_JOB_FAILED = "QUEUE_JOB_FAILED" as const;

export type QueueJobFailedActivityDetails = {
  queueName: string;
  bullmqJobId: string;
  jobName: string;
  error: string;
  attemptsMade: number;
  unrecoverable: boolean;
  entityType?: string;
  entityId?: string;
  emailTemplate?: string;
  emailRecipient?: string;
  emailFailureCount?: number;
  emailDeliveredDespiteFailure?: boolean;
};

async function logQueueJobFailedActivity(
  details: QueueJobFailedActivityDetails,
  candidateId?: string | null
): Promise<void> {
  const serialized = serializeActivityLogDetails(details);
  if (serialized.ok === false) {
    console.error("[domain-queue-failures] activity details serialize failed:", serialized.message);
    return;
  }

  try {
    await prisma.activityLog.create({
      data: {
        candidateId: candidateId ?? undefined,
        userId: undefined,
        action: ACTIVITY_ACTION_QUEUE_JOB_FAILED,
        details: serialized.json,
      },
    });
  } catch (e) {
    console.error(
      "[domain-queue-failures] ActivityLog write failed:",
      e instanceof Error ? e.message : e
    );
  }
}

async function markResumeParseFailedForCandidate(
  payload: ResumeParsingJobPayload,
  errorMessage: string
): Promise<void> {
  const hashed = await computeResumeSha256HexFromResumeUrl(payload.resumeUrl);
  if (hashed.ok === false) return;

  const parseJob = await prisma.resumeParseJob.findFirst({
    where: {
      candidateId: payload.candidateId,
      fileHash: hashed.hash,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!parseJob) return;

  try {
    await failResumeParseJobAndLog(prisma, {
      jobId: parseJob.id,
      candidateId: payload.candidateId,
      userId: null,
      error: errorMessage.slice(0, 2000),
    });
  } catch (e) {
    console.error(
      "[domain-queue-failures] failResumeParseJobAndLog failed:",
      e instanceof Error ? e.message : e
    );
  }
}

/**
 * Domain side-effects when a queue job has permanently failed (retries exhausted or unrecoverable).
 */
export async function persistDomainFailureForExhaustedJob(
  queueName: string,
  job: Job,
  serialized: SerializedJobError,
  meta: QueueJobFailureMeta | null
): Promise<void> {
  const errorMessage = meta?.message ?? serialized.message;
  const details: QueueJobFailedActivityDetails = {
    queueName,
    bullmqJobId: job.id ?? "unknown",
    jobName: job.name,
    error: errorMessage,
    attemptsMade: job.attemptsMade,
    unrecoverable: serialized.unrecoverable,
  };

  if (queueName === RESUME_PARSING_QUEUE_NAME) {
    const payload = job.data as ResumeParsingJobPayload;
    details.entityType = "candidate";
    details.entityId = payload.candidateId;
    await markResumeParseFailedForCandidate(payload, errorMessage);
    await logQueueJobFailedActivity(details, payload.candidateId);
    return;
  }

  if (queueName === EMBEDDING_QUEUE_NAME) {
    const payload = job.data as EmbeddingJobPayload;
    details.entityType = payload.entityType;
    details.entityId = payload.entityId;
    const candidateId = payload.entityType === "candidate" ? payload.entityId : null;
    await markEmbeddingJobFailed({
      entityType: payload.entityType,
      entityId: payload.entityId,
      error: errorMessage,
    });
    await logQueueJobFailedActivity(details, candidateId);
    return;
  }

  if (queueName === EMAIL_QUEUE_NAME) {
    try {
      const payload = extractEmailJobPayload(job.data);
      const summary = summarizeEmailJobFailures(job as Job<EmailJobPayload>);
      const history = readEmailFailureHistory(job.data);

      details.entityType = "email";
      details.entityId = payload.recipient;
      details.emailTemplate = payload.template;
      details.emailRecipient = payload.recipient;
      details.emailFailureCount = history.length;
      details.emailDeliveredDespiteFailure = summary.delivered;

      if (history.length > 0) {
        console.error(
          `[domain-queue-failures] email job=${job.id} template=${payload.template} recipient=${payload.recipient} failures=${JSON.stringify(history)}`
        );
      }

      if (job.id) {
        await markEmailLogFailed({
          bullmqJobId: job.id,
          error: errorMessage,
        });
      }
    } catch {
      const raw = job.data as EmailJobPayload;
      details.entityType = "email";
      details.entityId =
        typeof raw?.recipient === "string" ? raw.recipient : "unknown";
    }
    await logQueueJobFailedActivity(details, null);
    return;
  }

  await logQueueJobFailedActivity(details, null);
}

export function getStoredFailureMessage(job: Job): string | null {
  return readQueueJobFailureMeta(job.data)?.message ?? null;
}
