import type { QueueWorkersShutdown } from "@/src/lib/queues/workers";

let shuttingDown = false;

/**
 * Registers SIGINT/SIGTERM handlers that drain workers once (idempotent).
 */
export function registerWorkerProcessShutdown(shutdown: QueueWorkersShutdown): void {
  const run = async (signal: string) => {
    if (shuttingDown) {
      console.info(`[workers] ${signal} ignored — shutdown already in progress`);
      return;
    }
    shuttingDown = true;

    console.info(`[workers] ${signal} received — starting graceful shutdown`);
    try {
      await shutdown();
      process.exit(0);
    } catch (err) {
      console.error("[workers] graceful shutdown failed:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void run("SIGINT"));
  process.on("SIGTERM", () => void run("SIGTERM"));
}
