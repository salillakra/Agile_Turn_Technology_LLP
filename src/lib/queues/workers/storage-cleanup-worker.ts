import type { Job } from "bullmq";
import type { QueueRedisConnection } from "@/src/lib/queues/redis";
import {
  STORAGE_CLEANUP_QUEUE_NAME,
  type StorageCleanupJobPayload,
} from "@/src/lib/queues/storage-cleanup-queue";
import { processStorageCleanupJob } from "@/src/lib/queues/workers/process-storage-cleanup-job";
import { createQueueWorker } from "@/src/lib/queues/workers/worker-runtime";

async function handleStorageCleanupJob(job: Job<StorageCleanupJobPayload>): Promise<void> {
  await processStorageCleanupJob(job);
}

export function createStorageCleanupWorker(connection: QueueRedisConnection) {
  return createQueueWorker<StorageCleanupJobPayload>(
    STORAGE_CLEANUP_QUEUE_NAME,
    connection,
    handleStorageCleanupJob,
    { name: "storage-cleanup", concurrency: 2 }
  );
}

export const storageCleanupWorker = createStorageCleanupWorker;
