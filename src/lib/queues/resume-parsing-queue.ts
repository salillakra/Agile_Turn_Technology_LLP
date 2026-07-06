/**
 * BullMQ queue for asynchronous resume parsing.
 *
 * Producers: upload/parse API routes enqueue `{ candidateId, resumeUrl }`.
 * Consumers: `workers/processors/` (not implemented yet).
 */

import { Queue, type QueueOptions } from "bullmq";
import { mergeJobRetryOptions } from "@/src/lib/queues/job-retry-options";
import { resolveJobDelayMs, type DelayedJobScheduleOptions } from "@/src/lib/queues/job-delay";
import { JOB_PRIORITY_MEDIUM } from "@/src/lib/queues/job-priority";
import { getQueueConnectionOptions } from "@/src/lib/queues/redis";
import { BULLMQ_QUEUE_NAMES } from "@/src/lib/queues/queue-names";
import { sanitizeBullmqJobId } from "@/src/lib/queues/bullmq-job-id";

/** Redis queue name for resume parsing workers (no `:` — BullMQ v5+ restriction). */
export const RESUME_PARSING_QUEUE_NAME = BULLMQ_QUEUE_NAMES.RESUME_PARSING;

/** BullMQ job name routed to the parse processor. */
export const RESUME_PARSING_JOB_NAME = "resume.parse" as const;

/** Job data stored in Redis and passed to the worker processor. */
export type ResumeParsingJobPayload = {
  candidateId: string;
  resumeUrl: string;
  /** When set, worker re-runs pipeline LLM-only enrichment for an existing parse job. */
  parseJobId?: string;
  llmRetryOnly?: boolean;
};

export type EnqueueResumeParsingJobOptions = DelayedJobScheduleOptions & {
  /**
   * Stable BullMQ job id for idempotency (same candidate re-upload replaces pending job).
   * Default: `resume-parse:{candidateId}`
   */
  jobId?: string;
  /** Default {@link JOB_PRIORITY_MEDIUM}. */
  priority?: number;
};

let queueInstance: Queue<ResumeParsingJobPayload> | null = null;

function resumeParsingQueueOptions(): QueueOptions {
  return {
    connection: getQueueConnectionOptions(),
    defaultJobOptions: mergeJobRetryOptions(),
  };
}

/** Lazily created BullMQ `Queue` for resume parsing. */
export function getResumeParsingQueue(): Queue<ResumeParsingJobPayload> {
  if (!queueInstance) {
    queueInstance = new Queue<ResumeParsingJobPayload>(
      RESUME_PARSING_QUEUE_NAME,
      resumeParsingQueueOptions()
    );
  }
  return queueInstance;
}

function defaultJobId(payload: ResumeParsingJobPayload): string {
  return `resume-parse:${payload.candidateId}`;
}

/**
 * Enqueue a resume parse job. Returns BullMQ job id.
 * Does not run parsing — worker consumes the queue later.
 */
export async function enqueueResumeParsingJob(
  payload: ResumeParsingJobPayload,
  options?: EnqueueResumeParsingJobOptions
): Promise<string> {
  if (!payload.candidateId?.trim()) {
    throw new Error("enqueueResumeParsingJob: candidateId is required");
  }
  if (!payload.resumeUrl?.trim()) {
    throw new Error("enqueueResumeParsingJob: resumeUrl is required");
  }

  const normalized: ResumeParsingJobPayload = {
    candidateId: payload.candidateId.trim(),
    resumeUrl: payload.resumeUrl.trim(),
  };

  const job = await getResumeParsingQueue().add(
    RESUME_PARSING_JOB_NAME,
    normalized,
    mergeJobRetryOptions({
      jobId: sanitizeBullmqJobId(options?.jobId ?? defaultJobId(normalized)),
      delay: resolveJobDelayMs(options),
      priority: options?.priority ?? JOB_PRIORITY_MEDIUM,
    })
  );

  if (!job.id) {
    throw new Error("enqueueResumeParsingJob: BullMQ did not return a job id");
  }
  return job.id;
}

/** Central export — queue metadata + enqueue helper (no worker logic). */
export const resumeParsingQueue = {
  name: RESUME_PARSING_QUEUE_NAME,
  jobName: RESUME_PARSING_JOB_NAME,
  get instance() {
    return getResumeParsingQueue();
  },
  enqueue: enqueueResumeParsingJob,
} as const;

export async function closeResumeParsingQueue(): Promise<void> {
  if (!queueInstance) return;
  const q = queueInstance;
  queueInstance = null;
  await q.close();
}
