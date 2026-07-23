import type { Prisma } from "@prisma/client";
import { QUEUE_JOB_STATUS } from "@/src/lib/queue-job-status";
import { prisma } from "@/src/lib/prisma";

type Db = Pick<typeof prisma, "resumeParseJob">;

export async function markResumeParseJobQueued(
  db: Db,
  params: { jobId: string; bullmqJobId?: string | null }
): Promise<void> {
  await db.resumeParseJob.update({
    where: { id: params.jobId },
    data: {
      status: QUEUE_JOB_STATUS.PENDING,
      bullmqJobId: params.bullmqJobId ?? undefined,
      error: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
    },
  });
}

export async function markResumeParseJobProcessing(
  db: Db,
  params: { jobId: string; attemptCount?: number; candidateId?: string }
): Promise<void> {
  await db.resumeParseJob.update({
    where: { id: params.jobId },
    data: {
      status: QUEUE_JOB_STATUS.PROCESSING,
      startedAt: new Date(),
      attemptCount: params.attemptCount ?? { increment: 1 },
      error: null,
    },
  });
  if (params.candidateId) {
    const { scheduleParseProgressForCandidate } = await import(
      "@/src/lib/parse-progress-realtime"
    );
    scheduleParseProgressForCandidate(params.candidateId, QUEUE_JOB_STATUS.PROCESSING);
  }
}

export async function markResumeParseJobCompleted(
  db: Db,
  params: {
    jobId: string;
    resultJson: Prisma.InputJsonValue;
  }
): Promise<void> {
  const now = new Date();
  await db.resumeParseJob.update({
    where: { id: params.jobId },
    data: {
      status: QUEUE_JOB_STATUS.COMPLETED,
      resultJson: params.resultJson,
      error: null,
      completedAt: now,
      failedAt: null,
    },
  });
}

export async function markResumeParseJobFailed(
  db: Db,
  params: { jobId: string; error: string }
): Promise<void> {
  const now = new Date();
  await db.resumeParseJob.update({
    where: { id: params.jobId },
    data: {
      status: QUEUE_JOB_STATUS.FAILED,
      error: params.error.slice(0, 4000),
      resultJson: null,
      failedAt: now,
      completedAt: null,
    },
  });
}
