import type { Job } from "bullmq";
import { isUnrecoverableError } from "@/src/lib/queues/workers/worker-errors";

/** Stored on BullMQ job `data.__queueFailure` (survives retries until success). */
export type QueueJobFailureMeta = {
  message: string;
  name: string;
  unrecoverable: boolean;
  attempt: number;
  failedAt: string;
  workerName: string;
};

export type SerializedJobError = {
  message: string;
  name: string;
  unrecoverable: boolean;
  stack?: string;
};

const QUEUE_FAILURE_KEY = "__queueFailure" as const;

export function serializeJobError(error: unknown): SerializedJobError {
  if (isUnrecoverableError(error)) {
    return {
      message: error.message,
      name: "UnrecoverableError",
      unrecoverable: true,
      stack: error.stack,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      unrecoverable: false,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
    name: "Error",
    unrecoverable: false,
  };
}

function buildFailureMeta(
  error: unknown,
  job: Job,
  workerName: string
): QueueJobFailureMeta {
  const serialized = serializeJobError(error);
  return {
    message: serialized.message,
    name: serialized.name,
    unrecoverable: serialized.unrecoverable,
    attempt: job.attemptsMade + 1,
    failedAt: new Date().toISOString(),
    workerName,
  };
}

/**
 * Persists failure metadata on the BullMQ job (Redis) without throwing.
 */
export async function recordJobAttemptFailure(
  job: Job,
  error: unknown,
  workerName: string
): Promise<QueueJobFailureMeta> {
  const meta = buildFailureMeta(error, job, workerName);
  const logLine = `attempt ${meta.attempt} failed: ${meta.message}`;

  try {
    await job.log(logLine);
  } catch (e) {
    console.error(
      `[worker:${workerName}] job.log failed job=${job.id}`,
      e instanceof Error ? e.message : e
    );
  }

  try {
    const data =
      job.data != null && typeof job.data === "object" && !Array.isArray(job.data)
        ? { ...(job.data as Record<string, unknown>) }
        : {};
    data[QUEUE_FAILURE_KEY] = meta;
    await job.updateData(data as typeof job.data);
  } catch (e) {
    console.error(
      `[worker:${workerName}] job.updateData failed job=${job.id}`,
      e instanceof Error ? e.message : e
    );
  }

  return meta;
}

export function readQueueJobFailureMeta(data: unknown): QueueJobFailureMeta | null {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const raw = (data as Record<string, unknown>)[QUEUE_FAILURE_KEY];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.message !== "string" || typeof o.failedAt !== "string") {
    return null;
  }
  return raw as QueueJobFailureMeta;
}
