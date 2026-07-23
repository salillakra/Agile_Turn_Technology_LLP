import type { Job } from "bullmq";
import type { ResumeParsingJobPayload } from "@/src/lib/queues/resume-parsing-queue";
import { computeResumeSha256HexFromResumeUrl } from "@/src/lib/resume-file-hash";
import {
  executeResumeParseJob,
  type ResumeParseJobRecord,
} from "@/src/lib/process-pending-parse-jobs";
import { markResumeParseJobProcessing } from "@/src/lib/resume-parse-job-status";
import { isResumeParseReady, QUEUE_JOB_STATUS } from "@/src/lib/queue-job-status";
import { logResumeParseStarted } from "@/src/lib/resume-parse-activity-log";
import { prisma } from "@/src/lib/prisma";
import { permanentWorkerError } from "@/src/lib/queues/workers/worker-errors";

async function resolveParseJobRecord(
  payload: ResumeParsingJobPayload
): Promise<ResumeParseJobRecord> {
  if (payload.llmRetryOnly && payload.parseJobId) {
    const existing = await prisma.resumeParseJob.findUnique({
      where: { id: payload.parseJobId },
      select: {
        id: true,
        candidateId: true,
        fileHash: true,
        llmRetryCount: true,
        status: true,
      },
    });
    if (!existing || existing.candidateId !== payload.candidateId) {
      throw permanentWorkerError(`Parse job not found for LLM retry: ${payload.parseJobId}`);
    }
    if (existing.status !== QUEUE_JOB_STATUS.PARTIAL && isResumeParseReady(existing.status)) {
      return existing;
    }
    return existing;
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: payload.candidateId },
    select: { id: true, candidateName: true, resumeUrl: true },
  });

  if (!candidate) {
    throw permanentWorkerError(`Candidate not found: ${payload.candidateId}`);
  }

  const hashed = await computeResumeSha256HexFromResumeUrl(payload.resumeUrl);
  if (hashed.ok === false) {
    throw permanentWorkerError(
      hashed.reason === "FILE_NOT_FOUND"
        ? "resume file missing from storage."
        : "resume URL is not a supported local storage reference."
    );
  }

  const existing = await prisma.resumeParseJob.findFirst({
    where: {
      candidateId: payload.candidateId,
      fileHash: hashed.hash,
      status: {
        in: [
          QUEUE_JOB_STATUS.PENDING,
          QUEUE_JOB_STATUS.PROCESSING,
          QUEUE_JOB_STATUS.COMPLETED,
          QUEUE_JOB_STATUS.PARTIAL,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      candidateId: true,
      fileHash: true,
      status: true,
      llmRetryCount: true,
    },
  });

  if (existing && isResumeParseReady(existing.status) && !payload.llmRetryOnly) {
    return existing;
  }

  if (
    existing?.status === QUEUE_JOB_STATUS.PENDING ||
    existing?.status === QUEUE_JOB_STATUS.PROCESSING
  ) {
    return existing;
  }

  const created = await prisma.resumeParseJob.create({
    data: {
      candidateId: payload.candidateId,
      status: "PENDING",
      fileHash: hashed.hash,
    },
    select: { id: true, candidateId: true, fileHash: true, llmRetryCount: true },
  });

  await logResumeParseStarted(prisma, {
    candidateId: payload.candidateId,
    userId: null,
    resumeParseJobId: created.id,
    fileHash: hashed.hash,
  });

  return created;
}

/**
 * BullMQ processor body for `resumeParsingQueue`.
 */
export async function processResumeParsingJob(job: Job<ResumeParsingJobPayload>): Promise<void> {
  const payload = job.data;
  const parseJob = await resolveParseJobRecord(payload);

  if (!payload.llmRetryOnly) {
    const existingDone = await prisma.resumeParseJob.findUnique({
      where: { id: parseJob.id },
      select: { status: true },
    });
    if (existingDone && isResumeParseReady(existingDone.status)) {
      return;
    }
  }

  await markResumeParseJobProcessing(prisma, {
    jobId: parseJob.id,
    attemptCount: job.attemptsMade + 1,
    candidateId: payload.candidateId,
  });

  const candidate = await prisma.candidate.findUnique({
    where: { id: payload.candidateId },
    select: { candidateName: true },
  });

  const result = await executeResumeParseJob(prisma, parseJob, {
    resumeUrl: payload.resumeUrl,
    candidateName: candidate?.candidateName ?? "",
    llmRetryOnly: Boolean(payload.llmRetryOnly),
  });

  if (result.outcome === "failed") {
    console.warn(
      "[resumeParsingWorker] parse failed for candidate=%s: %s",
      payload.candidateId,
      result.error
    );
    throw permanentWorkerError(result.error);
  }
}
