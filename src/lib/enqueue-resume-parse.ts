import type { ResumeParseJob } from "@prisma/client";
import { computeResumeSha256HexFromResumeUrl } from "@/src/lib/resume-file-hash";
import { processPendingParseJobs } from "@/src/lib/process-pending-parse-jobs";
import { isRedisConfigured } from "@/src/lib/queues/redis";
import { enqueueResumeParsingJob } from "@/src/lib/queues/resume-parsing-queue";
import { markResumeParseJobQueued } from "@/src/lib/resume-parse-job-status";
import { isResumeParseReady, QUEUE_JOB_STATUS } from "@/src/lib/queue-job-status";
import { logResumeParseStarted } from "@/src/lib/resume-parse-activity-log";
import { prisma } from "@/src/lib/prisma";

export type ResumeParseJobSummary = Pick<
  ResumeParseJob,
  | "id"
  | "candidateId"
  | "status"
  | "fileHash"
  | "resultJson"
  | "error"
  | "createdAt"
  | "updatedAt"
>;

const jobSelect = {
  id: true,
  candidateId: true,
  status: true,
  fileHash: true,
  resultJson: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type EnqueueResumeParseResult =
  | {
      ok: true;
      job: ResumeParseJobSummary;
      idempotent: boolean;
      /**
       * `none` — job already terminal (DONE/FAILED), no queue dispatch.
       * `queued` — BullMQ worker will process.
       * `inline-fallback` — dev-only drain when Redis is unset.
       */
      processing: "none" | "queued" | "inline-fallback";
      bullmqJobId: string | null;
    }
  | {
      ok: false;
      code:
        | "INVALID_RESUME_REFERENCE"
        | "RESUME_FILE_MISSING"
        | "QUEUE_UNAVAILABLE";
      message: string;
    };

function bullmqJobIdForParse(candidateId: string, fileHash: string, parseJobId: string): string {
  return `resume-parse:${candidateId}:${fileHash.slice(0, 16)}:${parseJobId}`;
}

async function dispatchParseToQueue(params: {
  candidateId: string;
  resumeUrl: string;
  parseJobId: string;
  fileHash: string;
}): Promise<{ processing: "queued" | "inline-fallback"; bullmqJobId: string | null }> {
  if (!isRedisConfigured()) {
    if (process.env.NODE_ENV === "development") {
      queueMicrotask(() => {
        void processPendingParseJobs(prisma, { limit: 1 }).catch((e) => {
          console.error("[enqueue-resume-parse] dev fallback drain failed:", e);
        });
      });
      return { processing: "inline-fallback", bullmqJobId: null };
    }
    throw new Error("QUEUE_UNAVAILABLE");
  }

  const bullmqJobId = await enqueueResumeParsingJob(
    {
      candidateId: params.candidateId,
      resumeUrl: params.resumeUrl,
    },
    {
      jobId: bullmqJobIdForParse(
        params.candidateId,
        params.fileHash,
        params.parseJobId
      ),
    }
  );

  return { processing: "queued", bullmqJobId };
}

/**
 * Creates or reuses a `ResumeParseJob` and enqueues BullMQ work (no inline parsing).
 */
export async function enqueueResumeParseForCandidate(params: {
  candidateId: string;
  resumeUrl: string;
  userId: string | null;
  forceNewJob?: boolean;
}): Promise<EnqueueResumeParseResult> {
  const resumeUrl = params.resumeUrl.trim();
  const hashed = await computeResumeSha256HexFromResumeUrl(resumeUrl);
  if (hashed.ok === false) {
    if (hashed.reason === "INVALID_URL") {
      return {
        ok: false,
        code: "INVALID_RESUME_REFERENCE",
        message: "resume URL is not a supported local storage reference.",
      };
    }
    return {
      ok: false,
      code: "RESUME_FILE_MISSING",
      message: "resume file is missing from storage; re-upload the resume.",
    };
  }

  const existing = await prisma.resumeParseJob.findFirst({
    where: {
      candidateId: params.candidateId,
      fileHash: hashed.hash,
    },
    orderBy: { createdAt: "desc" },
    select: jobSelect,
  });

  if (existing && !params.forceNewJob) {
    if (isResumeParseReady(existing.status) || existing.status === QUEUE_JOB_STATUS.FAILED) {
      return {
        ok: true,
        job: existing,
        idempotent: true,
        processing: "none",
        bullmqJobId: null,
      };
    }

    if (
      existing.status === QUEUE_JOB_STATUS.PENDING ||
      existing.status === QUEUE_JOB_STATUS.PROCESSING
    ) {
      try {
        const dispatch = await dispatchParseToQueue({
          candidateId: params.candidateId,
          resumeUrl,
          parseJobId: existing.id,
          fileHash: hashed.hash,
        });
        if (dispatch.bullmqJobId) {
          await markResumeParseJobQueued(prisma, {
            jobId: existing.id,
            bullmqJobId: dispatch.bullmqJobId,
          });
        }
        return {
          ok: true,
          job: existing,
          idempotent: true,
          processing: dispatch.processing,
          bullmqJobId: dispatch.bullmqJobId,
        };
      } catch (e) {
        if (e instanceof Error && e.message === "QUEUE_UNAVAILABLE") {
          return {
            ok: false,
            code: "QUEUE_UNAVAILABLE",
            message:
              "Parse job exists but Redis is not configured. Set REDIS_HOST or REDIS_URL and run the worker process.",
          };
        }
        throw e;
      }
    }
  }

  const job = await prisma.resumeParseJob.create({
    data: {
      candidateId: params.candidateId,
      status: "PENDING",
      fileHash: hashed.hash,
    },
    select: jobSelect,
  });

  await logResumeParseStarted(prisma, {
    candidateId: params.candidateId,
    userId: params.userId,
    resumeParseJobId: job.id,
    fileHash: job.fileHash,
  });

  try {
    const dispatch = await dispatchParseToQueue({
      candidateId: params.candidateId,
      resumeUrl,
      parseJobId: job.id,
      fileHash: hashed.hash,
    });
    if (dispatch.bullmqJobId) {
      await markResumeParseJobQueued(prisma, {
        jobId: job.id,
        bullmqJobId: dispatch.bullmqJobId,
      });
    }
    const refreshed = await prisma.resumeParseJob.findUnique({
      where: { id: job.id },
      select: jobSelect,
    });
    return {
      ok: true,
      job: refreshed ?? job,
      idempotent: false,
      processing: dispatch.processing,
      bullmqJobId: dispatch.bullmqJobId,
    };
  } catch (e) {
    if (e instanceof Error && e.message === "QUEUE_UNAVAILABLE") {
      return {
        ok: false,
        code: "QUEUE_UNAVAILABLE",
        message:
          "resume parse job was created but the queue is unavailable. Configure Redis and run `npm run worker`.",
      };
    }
    throw e;
  }
}

function llmRetryDelayMs(retryCount: number): number {
  const base = parseInt(process.env.AI_RESUME_LLM_RETRY_DELAY_MS ?? "300000", 10);
  const ms = Number.isFinite(base) && base > 0 ? base : 300_000;
  return ms * Math.max(1, retryCount);
}

/**
 * Schedules a delayed BullMQ job to retry LLM enrichment for a PARTIAL parse job.
 */
export async function enqueueResumeLlmRetryJob(params: {
  candidateId: string;
  resumeUrl: string;
  parseJobId: string;
  retryCount: number;
}): Promise<void> {
  if (!isRedisConfigured()) return;

  const delayMs = llmRetryDelayMs(params.retryCount);
  await enqueueResumeParsingJob(
    {
      candidateId: params.candidateId,
      resumeUrl: params.resumeUrl,
      parseJobId: params.parseJobId,
      llmRetryOnly: true,
    },
    {
      jobId: sanitizeBullmqJobIdForRetry(params),
      delay: delayMs,
    }
  );
}

function sanitizeBullmqJobIdForRetry(params: {
  candidateId: string;
  parseJobId: string;
  retryCount: number;
}): string {
  return `resume-parse-llm-retry:${params.candidateId}:${params.parseJobId.slice(0, 12)}:${params.retryCount}`;
}
