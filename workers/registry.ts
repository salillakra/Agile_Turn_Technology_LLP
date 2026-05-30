/**
 * Worker process bootstrap — delegates to `src/lib/queues/workers`.
 */

import { startQueueWorkers, type QueueWorkersShutdown } from "@/src/lib/queues/workers";

export type WorkerShutdown = QueueWorkersShutdown;

/** Starts resume parsing, embedding, and email BullMQ workers. */
export async function startWorkers(): Promise<WorkerShutdown> {
  const { shutdown, workers } = await startQueueWorkers();
  console.info(`[workers] registered ${workers.length} BullMQ worker(s)`);
  return shutdown;
}
