import type { Job } from "bullmq";
import type { QueueRedisConnection } from "@/src/lib/queues/redis";
import {
  RESUME_PARSING_QUEUE_NAME,
  type ResumeParsingJobPayload,
} from "@/src/lib/queues/resume-parsing-queue";
import { processResumeParsingJob } from "@/src/lib/queues/workers/process-resume-parsing-job";
import { createQueueWorker } from "@/src/lib/queues/workers/worker-runtime";

const PARSE_CONCURRENCY = 2;

async function handleResumeParsingJob(job: Job<ResumeParsingJobPayload>): Promise<void> {
  await processResumeParsingJob(job);
}

/** Listens to `ats-resume-parsing` and runs heuristic résumé extraction. */
export function createResumeParsingWorker(connection: QueueRedisConnection) {
  return createQueueWorker<ResumeParsingJobPayload>(
    RESUME_PARSING_QUEUE_NAME,
    connection,
    handleResumeParsingJob,
    { name: "resume-parsing", concurrency: PARSE_CONCURRENCY }
  );
}

/** @alias createResumeParsingWorker */
export const resumeParsingWorker = createResumeParsingWorker;
