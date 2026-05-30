import { upsertEmbeddingJobQueued } from "@/src/lib/embedding-job-status";
import { QueueEnqueueRateLimitedError } from "@/src/lib/queues/queue-enqueue-rate-limit";
import type {
  EmbeddingEntityType,
  EnqueueEmbeddingJobOptions,
} from "@/src/lib/queues/embedding-queue";
import { enqueueEmbeddingJob } from "@/src/lib/queues/embedding-queue";
import { isRedisConfigured } from "@/src/lib/queues/redis";
import { extractEmbeddingVector } from "@/src/lib/vector-similarity";

export type EnqueueEntityEmbeddingResult =
  | { ok: true; bullmqJobId: string; processing: "queued" }
  | { ok: false; code: "QUEUE_UNAVAILABLE" | "RATE_LIMITED"; message: string };

function defaultBullmqJobId(entityType: EmbeddingEntityType, entityId: string): string {
  return `embed:${entityType}:${entityId}`;
}

/**
 * Enqueue semantic embedding generation for a job or candidate (no inline `/embed` in API).
 */
export async function enqueueEntityEmbedding(
  entityType: EmbeddingEntityType,
  entityId: string,
  options?: Pick<
    EnqueueEmbeddingJobOptions,
    "jobId" | "delay" | "runAt" | "priority" | "force"
  >
): Promise<EnqueueEntityEmbeddingResult> {
  const id = entityId.trim();
  if (!id) {
    throw new Error("enqueueEntityEmbedding: entityId is required");
  }

  if (!isRedisConfigured()) {
    return {
      ok: false,
      code: "QUEUE_UNAVAILABLE",
      message:
        "Embedding queue is unavailable. Set REDIS_HOST or REDIS_URL and run `npm run worker`.",
    };
  }

  let bullmqJobId: string;
  try {
    bullmqJobId = await enqueueEmbeddingJob(
      {
        entityType,
        entityId: id,
        ...(options?.force === true ? { force: true } : {}),
      },
      {
        jobId: options?.jobId ?? defaultBullmqJobId(entityType, id),
        delay: options?.delay,
        runAt: options?.runAt,
        priority: options?.priority,
        force: options?.force,
      }
    );
  } catch (e) {
    if (e instanceof QueueEnqueueRateLimitedError) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: e.message,
      };
    }
    throw e;
  }

  await upsertEmbeddingJobQueued({
    entityType,
    entityId: id,
    bullmqJobId,
  });

  return { ok: true, bullmqJobId, processing: "queued" };
}

export function enqueueJobEmbedding(
  jobId: string,
  options?: Pick<
    EnqueueEmbeddingJobOptions,
    "jobId" | "delay" | "runAt" | "priority" | "force"
  >
): Promise<EnqueueEntityEmbeddingResult> {
  return enqueueEntityEmbedding("job", jobId, options);
}

export function enqueueCandidateEmbedding(
  candidateId: string,
  options?: Pick<
    EnqueueEmbeddingJobOptions,
    "jobId" | "delay" | "runAt" | "priority" | "force"
  >
): Promise<EnqueueEntityEmbeddingResult> {
  return enqueueEntityEmbedding("candidate", candidateId, options);
}

/**
 * Fire-and-forget enqueue for missing vectors (recommendations GET must not block on AI).
 */
export function enqueueMissingEmbeddingsForRecommendations(params: {
  jobId: string;
  jobEmbedding: unknown;
  candidateIds: readonly string[];
  candidateEmbeddings: ReadonlyMap<string, unknown>;
  maxCandidates?: number;
}): void {
  const max = params.maxCandidates ?? 25;

  if (!isRedisConfigured()) {
    return;
  }

  if (extractEmbeddingVector(params.jobEmbedding) == null) {
    void enqueueJobEmbedding(params.jobId).catch((e) => {
      console.error("[enqueue-entity-embedding] job embed enqueue failed:", e);
    });
  }

  let scheduled = 0;
  for (const candidateId of params.candidateIds) {
    if (scheduled >= max) break;
    if (extractEmbeddingVector(params.candidateEmbeddings.get(candidateId))) continue;
    scheduled += 1;
    void enqueueCandidateEmbedding(candidateId).catch((e) => {
      console.error(
        "[enqueue-entity-embedding] candidate embed enqueue failed %s:",
        candidateId,
        e
      );
    });
  }
}

/** Log-only when queue is down — API handlers should not fail the main mutation. */
export function enqueueEntityEmbeddingBestEffort(
  entityType: EmbeddingEntityType,
  entityId: string,
  context: string
): void {
  void enqueueEntityEmbedding(entityType, entityId).then((result) => {
    if (result.ok === false) {
      console.warn(`[${context}] ${result.message}`);
    }
  });
}
