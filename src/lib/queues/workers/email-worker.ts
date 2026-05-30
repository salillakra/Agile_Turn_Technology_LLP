import type { Job } from "bullmq";
import type { QueueRedisConnection } from "@/src/lib/queues/redis";
import { EMAIL_QUEUE_NAME, type EmailJobPayload } from "@/src/lib/queues/email-queue";
import {
  getEmailWorkerConcurrency,
  getEmailWorkerRateLimiter,
} from "@/src/lib/queues/queue-worker-rate-limit";
import { processEmailJob } from "@/src/lib/queues/workers/process-email-job";
import { createQueueWorker } from "@/src/lib/queues/workers/worker-runtime";

async function handleEmailJob(job: Job<EmailJobPayload>): Promise<void> {
  await processEmailJob(job);
}

/** Listens to `ats-email` and sends transactional mail when provider is configured. */
export function createEmailWorker(connection: QueueRedisConnection) {
  return createQueueWorker<EmailJobPayload>(
    EMAIL_QUEUE_NAME,
    connection,
    handleEmailJob,
    {
      name: "email",
      concurrency: getEmailWorkerConcurrency(),
      limiter: getEmailWorkerRateLimiter(),
    }
  );
}

/** @alias createEmailWorker */
export const emailWorker = createEmailWorker;
