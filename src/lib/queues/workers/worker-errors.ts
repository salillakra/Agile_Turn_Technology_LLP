import { UnrecoverableError } from "bullmq";

/** Permanent failure — BullMQ will not retry (job moves to failed set). */
export function permanentWorkerError(message: string, cause?: unknown): UnrecoverableError {
  const msg = cause instanceof Error ? `${message} (cause: ${cause.message})` : message;
  return new UnrecoverableError(msg);
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

export function isUnrecoverableError(error: unknown): error is UnrecoverableError {
  return error instanceof UnrecoverableError;
}
