import { UnrecoverableError } from "bullmq";

/** Permanent failure — BullMQ will not retry (job moves to failed set). */
export function permanentWorkerError(message: string, cause?: unknown): UnrecoverableError {
  if (cause instanceof Error) {
    return new UnrecoverableError(message, { cause });
  }
  return new UnrecoverableError(message);
}

/** Transient failure — BullMQ retries per queue `attempts` / `backoff`. */
export function transientWorkerError(message: string, cause?: unknown): Error {
  if (cause instanceof Error) {
    const err = new Error(message);
    err.cause = cause;
    return err;
  }
  return new Error(message);
}

export function isUnrecoverableError(error: unknown): boolean {
  return error instanceof UnrecoverableError;
}
