import type { EmbeddingJobEntityType, EmbeddingJobStatus } from "@prisma/client";
import { QUEUE_JOB_STATUS } from "@/src/lib/queue-job-status";
import { prisma } from "@/src/lib/prisma";

export function toPrismaEmbeddingEntityType(
  entityType: "job" | "candidate"
): EmbeddingJobEntityType {
  return entityType === "job" ? "JOB" : "CANDIDATE";
}

export async function upsertEmbeddingJobQueued(params: {
  entityType: "job" | "candidate";
  entityId: string;
  bullmqJobId?: string | null;
}): Promise<{ id: string }> {
  const entityType = toPrismaEmbeddingEntityType(params.entityType);
  const row = await prisma.embeddingJob.upsert({
    where: {
      entityType_entityId: {
        entityType,
        entityId: params.entityId,
      },
    },
    create: {
      entityType,
      entityId: params.entityId,
      status: QUEUE_JOB_STATUS.PENDING as EmbeddingJobStatus,
      bullmqJobId: params.bullmqJobId ?? null,
      error: null,
      attemptCount: 0,
    },
    update: {
      status: QUEUE_JOB_STATUS.PENDING as EmbeddingJobStatus,
      bullmqJobId: params.bullmqJobId ?? null,
      error: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      attemptCount: 0,
    },
    select: { id: true },
  });
  return row;
}

export async function markEmbeddingJobProcessing(params: {
  entityType: "job" | "candidate";
  entityId: string;
  attemptCount?: number;
}): Promise<void> {
  const entityType = toPrismaEmbeddingEntityType(params.entityType);
  await prisma.embeddingJob.updateMany({
    where: { entityType, entityId: params.entityId },
    data: {
      status: QUEUE_JOB_STATUS.PROCESSING as EmbeddingJobStatus,
      startedAt: new Date(),
      attemptCount: params.attemptCount ?? { increment: 1 },
      error: null,
    },
  });
}

export async function markEmbeddingJobCompleted(params: {
  entityType: "job" | "candidate";
  entityId: string;
}): Promise<void> {
  const entityType = toPrismaEmbeddingEntityType(params.entityType);
  const now = new Date();
  await prisma.embeddingJob.updateMany({
    where: { entityType, entityId: params.entityId },
    data: {
      status: QUEUE_JOB_STATUS.COMPLETED as EmbeddingJobStatus,
      error: null,
      completedAt: now,
      failedAt: null,
    },
  });
}

export async function markEmbeddingJobFailed(params: {
  entityType: "job" | "candidate";
  entityId: string;
  error: string;
}): Promise<void> {
  const entityType = toPrismaEmbeddingEntityType(params.entityType);
  const now = new Date();
  await prisma.embeddingJob.updateMany({
    where: { entityType, entityId: params.entityId },
    data: {
      status: QUEUE_JOB_STATUS.FAILED as EmbeddingJobStatus,
      error: params.error.slice(0, 4000),
      failedAt: now,
      completedAt: null,
    },
  });
}

export async function getEmbeddingJobStatus(params: {
  entityType: "job" | "candidate";
  entityId: string;
}) {
  const entityType = toPrismaEmbeddingEntityType(params.entityType);
  return prisma.embeddingJob.findUnique({
    where: {
      entityType_entityId: { entityType, entityId: params.entityId },
    },
    select: {
      id: true,
      status: true,
      error: true,
      bullmqJobId: true,
      attemptCount: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      updatedAt: true,
    },
  });
}
