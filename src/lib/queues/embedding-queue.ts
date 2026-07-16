/**
 * BullMQ queue for asynchronous semantic embedding generation.
 *
 * Producers: job/candidate create-update, parse-complete, recommendation backfill.
 * Consumers: `workers/processors/` (not implemented yet).
 */

import { Queue, type QueueOptions } from "bullmq";
import { mergeJobRetryOptions } from "@/src/lib/queues/job-retry-options";
import { assertQueueEnqueueRateLimit } from "@/src/lib/queues/queue-enqueue-rate-limit";
import { resolveJobDelayMs, type DelayedJobScheduleOptions } from "@/src/lib/queues/job-delay";
import { JOB_PRIORITY_MEDIUM } from "@/src/lib/queues/job-priority";
import { getQueueConnectionOptions } from "@/src/lib/queues/redis";
import { BULLMQ_QUEUE_NAMES } from "@/src/lib/queues/queue-names";
import { sanitizeBullmqJobId } from "@/src/lib/queues/bullmq-job-id";

/** Redis queue name for embedding workers (no `:` — BullMQ v5+ restriction). */
export const EMBEDDING_QUEUE_NAME = BULLMQ_QUEUE_NAMES.EMBEDDING;

/** BullMQ job name routed to the embedding processor. */
export const EMBEDDING_JOB_NAME = "embedding.generate" as const;

export type EmbeddingEntityType = "candidate" | "job";

const EMBEDDING_ENTITY_TYPES: readonly EmbeddingEntityType[] = ["candidate", "job"];

/** Job data stored in Redis and passed to the worker processor. */
export type EmbeddingJobPayload = {
  entityType: EmbeddingEntityType;
  entityId: string;
  /** When true, worker re-embeds even if cached semantic text matches (post–resume parse). */
  force?: boolean;
};

export type EnqueueEmbeddingJobOptions = DelayedJobScheduleOptions & {
  /**
   * Stable BullMQ job id for idempotency.
   * Default: `embed:{entityType}:{entityId}`
   */
  jobId?: string;
  /** Default {@link JOB_PRIORITY_MEDIUM} (between urgent email and analytics). */
  priority?: number;
  /** Passed to worker — re-embed when true (e.g. after resume NLP parse). */
  force?: boolean;
};

let queueInstance: Queue<EmbeddingJobPayload> | null = null;

function embeddingQueueOptions(): QueueOptions {
  return {
    connection: getQueueConnectionOptions(),
    defaultJobOptions: mergeJobRetryOptions({
      removeOnComplete: { age: 86_400, count: 1_000 },
    }),
  };
}

/** Lazily created BullMQ `Queue` for embedding generation. */
export function getEmbeddingQueue(): Queue<EmbeddingJobPayload> {
  if (!queueInstance) {
    queueInstance = new Queue<EmbeddingJobPayload>(
      EMBEDDING_QUEUE_NAME,
      embeddingQueueOptions()
    );
  }
  return queueInstance;
}

function assertEmbeddingEntityType(value: string): EmbeddingEntityType {
  if ((EMBEDDING_ENTITY_TYPES as readonly string[]).includes(value)) {
    return value as EmbeddingEntityType;
  }
  throw new Error(
    `enqueueEmbeddingJob: entityType must be "candidate" or "job", got "${value}"`
  );
}

function defaultJobId(payload: EmbeddingJobPayload): string {
  return `embed:${payload.entityType}:${payload.entityId}`;
}

/**
 * Enqueue an embedding generation job. Returns BullMQ job id.
 * Does not call `ai-service` — worker consumes the queue later.
 */
export async function enqueueEmbeddingJob(
  payload: EmbeddingJobPayload,
  options?: EnqueueEmbeddingJobOptions
): Promise<string> {
  if (!payload.entityId?.trim()) {
    throw new Error("enqueueEmbeddingJob: entityId is required");
  }

  await assertQueueEnqueueRateLimit("embedding");

  const normalized: EmbeddingJobPayload = {
    entityType: assertEmbeddingEntityType(payload.entityType),
    entityId: payload.entityId.trim(),
    ...(payload.force === true ? { force: true } : {}),
    ...(options?.force === true ? { force: true } : {}),
  };

  const job = await getEmbeddingQueue().add(
    EMBEDDING_JOB_NAME,
    normalized,
    mergeJobRetryOptions({
      jobId: sanitizeBullmqJobId(options?.jobId ?? defaultJobId(normalized)),
      delay: resolveJobDelayMs(options),
      priority: options?.priority ?? JOB_PRIORITY_MEDIUM,
    })
  );

  if (!job.id) {
    throw new Error("enqueueEmbeddingJob: BullMQ did not return a job id");
  }
  return job.id;
}

/** Central export — queue metadata + enqueue helper (no worker logic). */
export const embeddingQueue = {
  name: EMBEDDING_QUEUE_NAME,
  jobName: EMBEDDING_JOB_NAME,
  get instance() {
    return getEmbeddingQueue();
  },
  enqueue: enqueueEmbeddingJob,
} as const;

export async function closeEmbeddingQueue(): Promise<void> {
  if (!queueInstance) return;
  const q = queueInstance;
  queueInstance = null;
  await q.close();
}
