import type { Job } from "bullmq";
import {
  recordJobAttemptFailure,
  serializeJobError,
} from "@/src/lib/queues/workers/job-failure-record";
import {
  isUnrecoverableError,
  transientWorkerError,
} from "@/src/lib/queues/workers/worker-errors";

export type JobProcessorContext = {
  workerName: string;
  queueName: string;
};

/**
 * Wraps a BullMQ processor so errors are caught, recorded on the job, and re-thrown
 * for BullMQ retry/failed semantics — never crashes the worker process.
 */
export function wrapJobProcessor<TData>(
  context: JobProcessorContext,
  handler: (job: Job<TData>) => Promise<void>
): (job: Job<TData>) => Promise<void> {
  return async (job: Job<TData>) => {
    try {
      await handler(job);
    } catch (error) {
      try {
        await recordJobAttemptFailure(job, error, context.workerName);
      } catch (recordErr) {
        console.error(
          `[worker:${context.workerName}] failure recording threw job=${job.id}`,
          recordErr instanceof Error ? recordErr.message : recordErr
        );
      }

      throw normalizeProcessorError(error, job, context.workerName);
    }
  };
}

function normalizeProcessorError(
  error: unknown,
  job: Job,
  workerName: string
): Error {
  if (isUnrecoverableError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return transientWorkerError(
      `[${workerName}] job ${job.id ?? "?"} failed: ${error.message}`,
      error
    );
  }
  return transientWorkerError(
    `[${workerName}] job ${job.id ?? "?"} failed: ${String(error)}`,
    error
  );
}

/** Safe handler for worker-level `error` events (Redis connection glitches). */
export function logWorkerRuntimeError(workerName: string, error: unknown): void {
  const serialized = serializeJobError(error);
  console.error(
    `[worker:${workerName}] runtime error name=${serialized.name} message=${serialized.message}`,
    serialized.stack ?? error
  );
}
