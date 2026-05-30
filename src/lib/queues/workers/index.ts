/**
 * BullMQ worker infrastructure — run via `app/workers/index.ts` (separate process).
 */

import type { Worker } from "bullmq";
import {
  createWorkerRedisConnectionForWorker,
  type QueueRedisConnection,
} from "@/src/lib/queues/redis";
import { shutdownQueueWorkersGracefully } from "@/src/lib/queues/workers/worker-graceful-shutdown";
import { createEmailWorker } from "@/src/lib/queues/workers/email-worker";
import { createEmbeddingWorker } from "@/src/lib/queues/workers/embedding-worker";
import {
  formatEnqueueRateLimit,
} from "@/src/lib/queues/queue-enqueue-rate-limit";
import { formatOutboundEmailRateLimits } from "@/src/lib/queues/email-outbound-rate-limit";
import {
  formatWorkerRateLimiter,
  getEmailWorkerConcurrency,
  getEmailWorkerRateLimiter,
  getEmbeddingWorkerRateLimiter,
} from "@/src/lib/queues/queue-worker-rate-limit";
import { validateEmailSecurityConfig } from "@/src/lib/email/email-security";
import { createResumeParsingWorker } from "@/src/lib/queues/workers/resume-parsing-worker";

export type QueueWorkersShutdown = () => Promise<void>;

export type StartedQueueWorkers = {
  workers: Worker[];
  connection: QueueRedisConnection;
  shutdown: QueueWorkersShutdown;
};

/**
 * Starts all ATS background workers (parse, embedding, email).
 */
export async function startQueueWorkers(): Promise<StartedQueueWorkers> {
  const redisConnections: QueueRedisConnection[] = [
    createWorkerRedisConnectionForWorker(),
    createWorkerRedisConnectionForWorker(),
    createWorkerRedisConnectionForWorker(),
  ];

  const workers: Worker[] = [
    createResumeParsingWorker(redisConnections[0]!),
    createEmbeddingWorker(redisConnections[1]!),
    createEmailWorker(redisConnections[2]!),
  ];

  console.info(
    `[workers] rate limits — ${formatWorkerRateLimiter("embedding", getEmbeddingWorkerRateLimiter())}; ${formatWorkerRateLimiter("email", getEmailWorkerRateLimiter())} concurrency=${getEmailWorkerConcurrency()}; ${formatOutboundEmailRateLimits()}; ${formatEnqueueRateLimit("embedding")}; ${formatEnqueueRateLimit("email")}`
  );

  const emailSecurity = validateEmailSecurityConfig();
  for (const warning of emailSecurity.warnings) {
    console.warn(`[workers] email security: ${warning}`);
  }

  const shutdown: QueueWorkersShutdown = async () => {
    await shutdownQueueWorkersGracefully({ workers, redisConnections });
  };

  return { workers, connection: redisConnections[0]!, shutdown };
}

export { createResumeParsingWorker, resumeParsingWorker } from "@/src/lib/queues/workers/resume-parsing-worker";
export { createEmbeddingWorker, embeddingWorker } from "@/src/lib/queues/workers/embedding-worker";
export { createEmailWorker, emailWorker } from "@/src/lib/queues/workers/email-worker";
export { processResumeParsingJob } from "@/src/lib/queues/workers/process-resume-parsing-job";
export { processEmbeddingJob } from "@/src/lib/queues/workers/process-embedding-job";
export { processEmailJob } from "@/src/lib/queues/workers/process-email-job";
export {
  extractEmailJobPayload,
  isEmailAlreadyDelivered,
  readEmailDeliveryRecord,
  readEmailFailureHistory,
  recordEmailDeliverySuccess,
  appendEmailFailureAttempt,
  summarizeEmailJobFailures,
  type EmailDeliveryRecord,
  type EmailFailureAttempt,
} from "@/src/lib/queues/workers/email-delivery-record";
export {
  permanentWorkerError,
  transientWorkerError,
  isUnrecoverableError,
} from "@/src/lib/queues/workers/worker-errors";

export {
  recordJobAttemptFailure,
  serializeJobError,
  readQueueJobFailureMeta,
  type QueueJobFailureMeta,
} from "@/src/lib/queues/workers/job-failure-record";

export { wrapJobProcessor, logWorkerRuntimeError } from "@/src/lib/queues/workers/worker-processor";

export {
  handleQueueJobFailedEvent,
} from "@/src/lib/queues/workers/job-failure-handler";

export {
  shutdownQueueWorkersGracefully,
  DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS,
  type GracefulWorkerShutdownParams,
} from "@/src/lib/queues/workers/worker-graceful-shutdown";

export {
  ACTIVITY_ACTION_QUEUE_JOB_FAILED,
  persistDomainFailureForExhaustedJob,
} from "@/src/lib/queues/workers/domain-queue-failures";
