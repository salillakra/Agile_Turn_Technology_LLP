import { Worker, type Job, type RateLimiterOptions, type WorkerOptions } from "bullmq";
import { assertValidBullMqQueueName } from "@/src/lib/queues/queue-names";
import type { QueueRedisConnection } from "@/src/lib/queues/redis";
import {
  isJobPermanentlyFailedForMetrics,
  recordQueueJobCompleted,
  recordQueueJobFailed,
  recordQueueJobRetry,
  recordQueueJobStalled,
} from "@/src/lib/queues/queue-analytics";
import { handleQueueJobFailedEvent } from "@/src/lib/queues/workers/job-failure-handler";
import { logJobRetryActive } from "@/src/lib/queues/workers/retry-logging";
import {
  logWorkerRuntimeError,
  wrapJobProcessor,
} from "@/src/lib/queues/workers/worker-processor";
import { workerLogger } from "@/src/lib/logger";

export type WorkerRuntimeOptions = {
  /** Logical name for logs (e.g. `resume-parsing`). */
  name: string;
  concurrency?: number;
  /** BullMQ worker rate limiter — caps jobs started per `duration` ms. */
  limiter?: RateLimiterOptions;
};

const DEFAULT_CONCURRENCY = 2;

/**
 * Creates a BullMQ worker with shared lifecycle logging and failure handling.
 */
export function createQueueWorker<TData>(
  queueName: string,
  connection: QueueRedisConnection,
  processor: (job: Job<TData>) => Promise<void>,
  runtime: WorkerRuntimeOptions
): Worker<TData> {
  assertValidBullMqQueueName(queueName);
  const workerName = runtime.name;
  const log = workerLogger(workerName);

  const options: WorkerOptions = {
    connection,
    concurrency: runtime.concurrency ?? DEFAULT_CONCURRENCY,
    ...(runtime.limiter ? { limiter: runtime.limiter } : {}),
  };

  if (runtime.limiter) {
    log.info(
      { max: runtime.limiter.max, durationMs: runtime.limiter.duration },
      "rate limiter configured"
    );
  }

  const safeProcessor = wrapJobProcessor<TData>(
    { workerName, queueName },
    processor
  );

  const worker = new Worker<TData>(queueName, safeProcessor, options);

  worker.on("active", (job) => {
    if (job.attemptsMade > 0) {
      logJobRetryActive(workerName, job);
      recordQueueJobRetry(queueName, workerName, job);
    } else {
      log.info({ jobId: job.id, jobName: job.name }, "job active");
    }
  });

  worker.on("completed", (job) => {
    log.info({ jobId: job.id }, "job completed");
    recordQueueJobCompleted(queueName, workerName, job);
  });

  worker.on("failed", (job, error) => {
    if (isJobPermanentlyFailedForMetrics(job, error)) {
      recordQueueJobFailed(queueName, workerName, job);
    }
    log.warn({ jobId: job?.id, err: error }, "job failed");
    void handleQueueJobFailedEvent(workerName, queueName, job, error);
  });

  worker.on("error", (error) => {
    logWorkerRuntimeError(workerName, error);
    log.error({ err: error }, "worker runtime error");
  });

  worker.on("stalled", (jobId) => {
    log.warn({ jobId }, "job stalled");
    recordQueueJobStalled(queueName, workerName, jobId);
  });

  return worker;
}
