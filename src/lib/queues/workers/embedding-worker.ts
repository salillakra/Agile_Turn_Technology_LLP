import type { Job } from "bullmq";
import type { QueueRedisConnection } from "@/src/lib/queues/redis";
import {
  EMBEDDING_QUEUE_NAME,
  type EmbeddingJobPayload,
} from "@/src/lib/queues/embedding-queue";
import { getEmbeddingWorkerRateLimiter } from "@/src/lib/queues/queue-worker-rate-limit";
import { processEmbeddingJob } from "@/src/lib/queues/workers/process-embedding-job";
import { createQueueWorker } from "@/src/lib/queues/workers/worker-runtime";

const EMBED_CONCURRENCY = 2;

async function handleEmbeddingJob(job: Job<EmbeddingJobPayload>): Promise<void> {
  await processEmbeddingJob(job.data);
}

/** Listens to `ats-embedding` and syncs vectors via `ai-service`. */
export function createEmbeddingWorker(connection: QueueRedisConnection) {
  return createQueueWorker<EmbeddingJobPayload>(
    EMBEDDING_QUEUE_NAME,
    connection,
    handleEmbeddingJob,
    {
      name: "embedding",
      concurrency: EMBED_CONCURRENCY,
      limiter: getEmbeddingWorkerRateLimiter(),
    }
  );
}

/** @alias createEmbeddingWorker */
export const embeddingWorker = createEmbeddingWorker;
