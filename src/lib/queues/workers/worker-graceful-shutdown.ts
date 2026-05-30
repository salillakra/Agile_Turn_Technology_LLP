import type { Worker } from "bullmq";
import { closeEmailTransporter } from "@/src/lib/email/transporter";
import type { QueueRedisConnection } from "@/src/lib/queues/redis";
import { closeWorkerRedisConnection } from "@/src/lib/queues/redis";

/** Max time to wait for in-flight jobs before `Worker.close(true)`. */
export const DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS = 120_000;

function parseShutdownTimeoutMs(): number {
  const raw = process.env.WORKER_SHUTDOWN_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS;
  return n;
}

function workerLabel(worker: Worker): string {
  const opts = worker.opts as { name?: string } | undefined;
  return opts?.name ?? worker.name ?? "worker";
}

/**
 * Closes BullMQ workers without `force` so active jobs can finish and locks renew
 * until completion (avoids stalled / half-written domain state).
 */
async function closeWorkersAndWaitForJobs(workers: Worker[]): Promise<void> {
  for (const worker of workers) {
    const label = workerLabel(worker);
    console.info(`[workers] closing ${label} — waiting for active jobs to finish`);
    await worker.close(false);
    console.info(`[workers] closed ${label}`);
  }
}

async function forceCloseWorkers(workers: Worker[]): Promise<void> {
  await Promise.allSettled(
    workers.map(async (worker) => {
      try {
        await worker.close(true);
      } catch (err) {
        console.error(
          `[workers] force close failed for ${workerLabel(worker)}:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );
}

async function closeRedisConnections(connections: QueueRedisConnection[]): Promise<void> {
  const unique = [...new Set(connections)];
  for (const connection of unique) {
    await closeWorkerRedisConnection(connection);
  }
}

export type GracefulWorkerShutdownParams = {
  workers: Worker[];
  /** One ioredis client per worker (do not share a single client across workers). */
  redisConnections: QueueRedisConnection[];
  timeoutMs?: number;
};

/**
 * Graceful worker-process shutdown:
 * 1. `Worker.close(false)` — drain active jobs (BullMQ waits for processors).
 * 2. Optional timeout → `close(true)` only if drain exceeds limit.
 * 3. `QUIT` each dedicated Redis connection.
 *
 * Does not close producer `Queue` instances (not used in the worker process).
 */
export async function shutdownQueueWorkersGracefully(
  params: GracefulWorkerShutdownParams
): Promise<void> {
  const { workers, redisConnections } = params;
  const timeoutMs = params.timeoutMs ?? parseShutdownTimeoutMs();

  if (workers.length === 0) {
    await closeRedisConnections(redisConnections);
    return;
  }

  console.info(
    `[workers] graceful shutdown started (workers=${workers.length}, timeoutMs=${timeoutMs})`
  );

  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    if (timeoutMs > 0) {
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs);
      });

      const result = await Promise.race([
        closeWorkersAndWaitForJobs(workers).then(() => "drained" as const),
        timeoutPromise,
      ]);

      if (result === "timeout") {
        timedOut = true;
        console.warn(
          `[workers] graceful shutdown timed out after ${timeoutMs}ms — force closing workers (in-flight jobs may retry)`
        );
        await forceCloseWorkers(workers);
      }
    } else {
      await closeWorkersAndWaitForJobs(workers);
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  await closeRedisConnections(redisConnections);
  await closeEmailTransporter();

  console.info(
    `[workers] graceful shutdown complete${timedOut ? " (forced after timeout)" : ""}`
  );
}
