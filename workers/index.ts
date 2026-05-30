/**
 * Background worker process entry point.
 *
 * Run separately from Next.js (long-lived process):
 *   npx tsx workers/index.ts
 *
 * Registers BullMQ `Worker` instances from `src/lib/queues/workers/`.
 */

import { getRedisTargetDescription, isRedisConfigured } from "@/src/lib/queues/redis";
import { QUEUE_NAMES } from "@/src/lib/queues/queues";
import {
  assertValidBullMqQueueName,
  listBullMqQueueNames,
} from "@/src/lib/queues/queue-names";
import { startWorkers } from "@/workers/registry";
import { registerWorkerProcessShutdown } from "@/workers/shutdown";

async function main(): Promise<void> {
  if (!isRedisConfigured()) {
    console.error(
      "[workers] Redis is not configured. Set REDIS_HOST/REDIS_PORT or REDIS_URL before starting workers."
    );
    process.exit(1);
  }

  const target = getRedisTargetDescription();
  console.info(`[workers] starting (redis=${target ?? "unknown"})`);

  for (const queueName of listBullMqQueueNames()) {
    assertValidBullMqQueueName(queueName);
  }

  const shutdown = await startWorkers();
  registerWorkerProcessShutdown(shutdown);

  process.on("unhandledRejection", (reason) => {
    console.error("[workers] unhandledRejection (process continues):", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("[workers] uncaughtException (process continues):", err);
  });

  const uniqueQueues = [...new Set(Object.values(QUEUE_NAMES))];
  console.info(`[workers] listening on queues: ${uniqueQueues.join(", ")}`);
}

main().catch((e) => {
  console.error("[workers] fatal error:", e);
  process.exit(1);
});
