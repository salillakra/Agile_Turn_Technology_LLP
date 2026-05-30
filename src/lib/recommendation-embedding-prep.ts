import {
  enqueueCandidateEmbedding,
  enqueueJobEmbedding,
  enqueueMissingEmbeddingsForRecommendations,
} from "@/src/lib/enqueue-entity-embedding";
import { getRecommendationEmbeddingRetryDelayMs } from "@/src/lib/queues/job-delay";
import { isRedisConfigured } from "@/src/lib/queues/redis";
import { extractEmbeddingVector } from "@/src/lib/vector-similarity";

/** Max candidates to enqueue per recommendations request (background backfill). */
const MAX_BACKGROUND_CANDIDATE_ENQUEUE = 25;

/**
 * Enqueue BullMQ jobs for job/candidate vectors that are missing.
 * Does not call `ai-service` — scoring uses stored embeddings only.
 */
function delayedEmbeddingJobId(
  entityType: "job" | "candidate",
  entityId: string
): string {
  return `embed:${entityType}:${entityId}:rec-refresh`;
}

/**
 * Second-pass embedding enqueue after recommendations — gives AI/worker time to finish
 * before the user refreshes the list (BullMQ delayed job).
 */
export function scheduleDelayedRecommendationEmbeddingRetry(params: {
  jobId: string;
  jobEmbedding: unknown;
  candidateIds: readonly string[];
  candidateEmbeddings: ReadonlyMap<string, unknown>;
  maxCandidates?: number;
}): void {
  if (!isRedisConfigured()) return;

  const delayMs = getRecommendationEmbeddingRetryDelayMs();
  if (delayMs <= 0) return;

  const max = params.maxCandidates ?? MAX_BACKGROUND_CANDIDATE_ENQUEUE;

  if (extractEmbeddingVector(params.jobEmbedding) == null) {
    void enqueueJobEmbedding(params.jobId, {
      jobId: delayedEmbeddingJobId("job", params.jobId),
      delay: delayMs,
    }).catch((e) => {
      console.error("[recommendation-embedding-prep] delayed job embed failed:", e);
    });
  }

  let scheduled = 0;
  for (const candidateId of params.candidateIds) {
    if (scheduled >= max) break;
    if (extractEmbeddingVector(params.candidateEmbeddings.get(candidateId))) continue;
    scheduled += 1;
    void enqueueCandidateEmbedding(candidateId, {
      jobId: delayedEmbeddingJobId("candidate", candidateId),
      delay: delayMs,
    }).catch((e) => {
      console.error(
        "[recommendation-embedding-prep] delayed candidate embed failed %s:",
        candidateId,
        e
      );
    });
  }
}

export function scheduleEmbeddingsForJobCandidateRecommendations(params: {
  jobId: string;
  jobEmbedding: unknown;
  candidateIds: readonly string[];
  candidateEmbeddings: ReadonlyMap<string, unknown>;
}): void {
  enqueueMissingEmbeddingsForRecommendations({
    jobId: params.jobId,
    jobEmbedding: params.jobEmbedding,
    candidateIds: params.candidateIds,
    candidateEmbeddings: params.candidateEmbeddings,
    maxCandidates: MAX_BACKGROUND_CANDIDATE_ENQUEUE,
  });

  scheduleDelayedRecommendationEmbeddingRetry({
    jobId: params.jobId,
    jobEmbedding: params.jobEmbedding,
    candidateIds: params.candidateIds,
    candidateEmbeddings: params.candidateEmbeddings,
    maxCandidates: MAX_BACKGROUND_CANDIDATE_ENQUEUE,
  });
}

export function hasStoredEmbedding(stored: unknown): boolean {
  return extractEmbeddingVector(stored) != null;
}
