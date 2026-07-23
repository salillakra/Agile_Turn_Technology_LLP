import { prisma } from "@/src/lib/prisma";
import { QUEUE_JOB_STATUS, isResumeParseReady } from "@/src/lib/queue-job-status";

export type ParseBatchCandidateStatus = {
  candidateId: string;
  resumeUrl: string | null;
  resumeFileName: string | null;
  status: string | null;
  error: string | null;
  resumeParseJobId: string | null;
};

export type ParseBatchProgress = {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  pending: number;
  left: number;
  candidates: ParseBatchCandidateStatus[];
};

/**
 * Latest ResumeParseJob status per candidate (for bulk import live progress).
 */
export async function getParseBatchProgress(
  candidateIds: string[]
): Promise<ParseBatchProgress> {
  const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return {
      total: 0,
      completed: 0,
      failed: 0,
      processing: 0,
      pending: 0,
      left: 0,
      candidates: [],
    };
  }

  const candidates = await prisma.candidate.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      resumeUrl: true,
      resumeFileName: true,
      resumeParseJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, error: true },
      },
    },
  });

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const rows: ParseBatchCandidateStatus[] = ids.map((candidateId) => {
    const c = byId.get(candidateId);
    const job = c?.resumeParseJobs[0];
    return {
      candidateId,
      resumeUrl: c?.resumeUrl ?? null,
      resumeFileName: c?.resumeFileName ?? null,
      status: job?.status ?? null,
      error: job?.error ?? null,
      resumeParseJobId: job?.id ?? null,
    };
  });

  let completed = 0;
  let failed = 0;
  let processing = 0;
  let pending = 0;
  for (const row of rows) {
    const s = row.status;
    if (s == null) {
      pending += 1;
      continue;
    }
    if (isResumeParseReady(s) || s === QUEUE_JOB_STATUS.COMPLETED || s === "PARTIAL") {
      completed += 1;
    } else if (s === QUEUE_JOB_STATUS.FAILED || s === "FAILED") {
      failed += 1;
    } else if (s === QUEUE_JOB_STATUS.PROCESSING || s === "PROCESSING") {
      processing += 1;
    } else {
      pending += 1;
    }
  }

  const left = processing + pending;
  return {
    total: rows.length,
    completed,
    failed,
    processing,
    pending,
    left,
    candidates: rows,
  };
}
