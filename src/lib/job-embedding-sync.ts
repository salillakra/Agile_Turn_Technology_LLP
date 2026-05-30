import type { Job, Prisma } from "@prisma/client";
import { embedTextWithDedupeAndCache } from "@/src/lib/ai/embedding-text-cache";
import { getConfiguredEmbeddingModel } from "@/src/lib/ai-service-client";
import { embeddingNeedsRefresh } from "@/src/lib/embedding-refresh";
import { buildJobSemanticText } from "@/src/lib/job-semantic-text";
import { enqueueJobEmbeddingAfterJobChange } from "@/src/lib/job-embedding-enqueue";
import { isPgvectorAvailable, toPgvectorLiteral } from "@/src/lib/pgvector-utils";
import { prisma } from "@/src/lib/prisma";
import { invalidateJobCandidateScoringCaches } from "@/src/lib/ai/candidate-scoring-cache";
import { invalidateJobRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";

export type SyncJobEmbeddingOptions = {
  /** Bypass semantic-text deduplication (e.g. after model upgrade). */
  force?: boolean;
};

export type StoredJobEmbedding = {
  model: string;
  vector: number[];
  semanticText: string;
};

function toStoredEmbedding(
  semanticText: string,
  vector: number[]
): StoredJobEmbedding {
  return {
    model: getConfiguredEmbeddingModel(),
    vector,
    semanticText,
  };
}

/**
 * Job embedding pipeline (async via BullMQ `ats:embedding`):
 *
 * 1. Job created/updated (API) → `enqueueJobEmbeddingAfterJobChange` (no inline `/embed`).
 * 2. Worker → `buildJobSemanticText` from title, description, skills, experience.
 * 3. Worker → `embedText` (FastAPI `/embed`).
 * 4. Worker → persist `Job.embedding` JSON + `jobs.embedding_vector` (pgvector).
 *
 * Freshness: `embeddingNeedsRefresh` skips re-embed when semantic text unchanged;
 * job updates that affect embedding fields enqueue with `force: true`.
 */
export async function syncJobEmbedding(
  jobId: string,
  options: SyncJobEmbeddingOptions = {}
): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  await syncJobEmbeddingFromRow(job, options);
}

export async function syncJobEmbeddingFromRow(
  job: Job,
  options: SyncJobEmbeddingOptions = {}
): Promise<void> {
  const semanticText = buildJobSemanticText({
    title: job.title,
    description: job.description,
    yearsOfExperience: job.yearsOfExperience,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    jobMeta: job.jobMeta,
  });

  if (!semanticText) {
    console.warn("[job-embedding-sync] skipped job %s: empty semantic text", job.id);
    return;
  }

  if (
    !embeddingNeedsRefresh({
      stored: job.embedding,
      semanticText,
      force: options.force,
    })
  ) {
    console.info("[job-embedding-sync] up to date for job %s", job.id);
    return;
  }

  const embedded = await embedTextWithDedupeAndCache(semanticText);
  if (embedded.ok === false) {
    console.error(
      "[job-embedding-sync] embed failed for job %s: %s",
      job.id,
      embedded.error
    );
    return;
  }

  const payload = toStoredEmbedding(semanticText, embedded.embedding);

  await prisma.job.update({
    where: { id: job.id },
    data: {
      embedding: payload as unknown as Prisma.InputJsonValue,
      embeddingUpdatedAt: new Date(),
    },
  });

  // Skip pgvector column update when extension is not installed.
  if (await isPgvectorAvailable()) {
    await prisma.$executeRaw`
      UPDATE "jobs"
      SET "embedding_vector" = ${toPgvectorLiteral(embedded.embedding)}::vector
      WHERE "id" = ${job.id}
    `;
  }

  void invalidateJobRecommendedCandidatesCaches(job.id);
  void invalidateJobCandidateScoringCaches(job.id);
}

/**
 * Enqueue background embedding generation (BullMQ worker runs `syncJobEmbedding`).
 * @deprecated Prefer `enqueueJobEmbeddingAfterJobChange` from `@/src/lib/job-embedding-enqueue`.
 */
export function scheduleJobEmbeddingSync(
  jobId: string,
  _options: SyncJobEmbeddingOptions = {}
): void {
  void enqueueJobEmbeddingAfterJobChange(jobId, { reason: "updated" });
}
