/**
 * BullMQ queue for delayed object-storage deletes (soft-deleted candidates).
 */

import { Queue, type QueueOptions } from "bullmq";
import { mergeJobRetryOptions } from "@/src/lib/queues/job-retry-options";
import { resolveJobDelayMs, type DelayedJobScheduleOptions } from "@/src/lib/queues/job-delay";
import { JOB_PRIORITY_LOW } from "@/src/lib/queues/job-priority";
import { getQueueConnectionOptions } from "@/src/lib/queues/redis";
import { BULLMQ_QUEUE_NAMES } from "@/src/lib/queues/queue-names";
import { sanitizeBullmqJobId } from "@/src/lib/queues/bullmq-job-id";

export const STORAGE_CLEANUP_QUEUE_NAME = BULLMQ_QUEUE_NAMES.STORAGE_CLEANUP;
export const STORAGE_CLEANUP_JOB_NAME = "storage.cleanup" as const;

export type StorageCleanupJobPayload = {
  candidateId: string;
  keys: string[];
};

export type EnqueueStorageCleanupOptions = DelayedJobScheduleOptions & {
  jobId?: string;
};

let queueInstance: Queue<StorageCleanupJobPayload> | null = null;

function storageCleanupQueueOptions(): QueueOptions {
  return {
    connection: getQueueConnectionOptions(),
    defaultJobOptions: mergeJobRetryOptions({
      priority: JOB_PRIORITY_LOW,
    }),
  };
}

export function getStorageCleanupQueue(): Queue<StorageCleanupJobPayload> {
  if (!queueInstance) {
    queueInstance = new Queue<StorageCleanupJobPayload>(
      STORAGE_CLEANUP_QUEUE_NAME,
      storageCleanupQueueOptions()
    );
  }
  return queueInstance;
}

/** ponytail: 24h delay is a stand-in for object-lock/versioning retention. Override STORAGE_CLEANUP_DELAY_MS. */
export function getStorageCleanupDelayMs(): number {
  const raw = process.env.STORAGE_CLEANUP_DELAY_MS?.trim();
  if (!raw) return 86_400_000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 86_400_000;
}

export async function enqueueStorageCleanupJob(
  payload: StorageCleanupJobPayload,
  options?: EnqueueStorageCleanupOptions
): Promise<string> {
  if (!payload.candidateId?.trim()) {
    throw new Error("enqueueStorageCleanupJob: candidateId is required");
  }
  const keys = payload.keys.filter((k) => typeof k === "string" && k.trim().length > 0);
  if (keys.length === 0) {
    throw new Error("enqueueStorageCleanupJob: keys is required");
  }

  const normalized: StorageCleanupJobPayload = {
    candidateId: payload.candidateId.trim(),
    keys,
  };

  const job = await getStorageCleanupQueue().add(
    STORAGE_CLEANUP_JOB_NAME,
    normalized,
    mergeJobRetryOptions({
      jobId: sanitizeBullmqJobId(options?.jobId ?? `storage-cleanup:${normalized.candidateId}`),
      delay: resolveJobDelayMs(options) ?? getStorageCleanupDelayMs(),
      priority: JOB_PRIORITY_LOW,
    })
  );

  if (!job.id) {
    throw new Error("enqueueStorageCleanupJob: BullMQ did not return a job id");
  }
  return job.id;
}

export async function closeStorageCleanupQueue(): Promise<void> {
  if (!queueInstance) return;
  const q = queueInstance;
  queueInstance = null;
  await q.close();
}
