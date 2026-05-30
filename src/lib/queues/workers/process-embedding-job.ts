import { syncCandidateEmbedding } from "@/src/lib/candidate-embedding-sync";
import {
  markEmbeddingJobCompleted,
  markEmbeddingJobFailed,
  markEmbeddingJobProcessing,
} from "@/src/lib/embedding-job-status";
import { syncJobEmbedding } from "@/src/lib/job-embedding-sync";
import type { EmbeddingJobPayload } from "@/src/lib/queues/embedding-queue";
import { prisma } from "@/src/lib/prisma";
import { entityEmbeddingFullyStored } from "@/src/lib/embedding-stored-check";
import {
  permanentWorkerError,
  transientWorkerError,
} from "@/src/lib/queues/workers/worker-errors";

async function embeddingStillMissingAfterSync(
  payload: EmbeddingJobPayload
): Promise<boolean> {
  if (payload.entityType === "job") {
    const row = await prisma.job.findUnique({
      where: { id: payload.entityId },
      select: { embedding: true },
    });
    if (row == null) return false;
    return !(await entityEmbeddingFullyStored("job", payload.entityId, row.embedding));
  }

  const row = await prisma.candidate.findUnique({
    where: { id: payload.entityId },
    select: { embedding: true },
  });
  if (row == null) return false;
  return !(await entityEmbeddingFullyStored(
    "candidate",
    payload.entityId,
    row.embedding
  ));
}

/**
 * BullMQ processor body for `embeddingQueue`.
 */
export async function processEmbeddingJob(payload: EmbeddingJobPayload): Promise<void> {
  await markEmbeddingJobProcessing({
    entityType: payload.entityType,
    entityId: payload.entityId,
  });

  try {
    if (payload.entityType === "job") {
      const exists = await prisma.job.findUnique({
        where: { id: payload.entityId },
        select: { id: true },
      });
      if (!exists) {
        throw permanentWorkerError(`Job not found: ${payload.entityId}`);
      }
      await syncJobEmbedding(payload.entityId, {
        force: payload.force === true,
      });
    } else if (payload.entityType === "candidate") {
      const exists = await prisma.candidate.findUnique({
        where: { id: payload.entityId },
        select: { id: true },
      });
      if (!exists) {
        throw permanentWorkerError(`Candidate not found: ${payload.entityId}`);
      }
      await syncCandidateEmbedding(payload.entityId, {
        force: payload.force === true,
      });
    } else {
      throw permanentWorkerError(`Invalid entityType: ${String(payload.entityType)}`);
    }

    if (await embeddingStillMissingAfterSync(payload)) {
      throw transientWorkerError(
        `Embedding not stored for ${payload.entityType}:${payload.entityId} (AI service may be unavailable)`
      );
    }

    await markEmbeddingJobCompleted({
      entityType: payload.entityType,
      entityId: payload.entityId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markEmbeddingJobFailed({
      entityType: payload.entityType,
      entityId: payload.entityId,
      error: msg,
    });
    throw e;
  }
}
