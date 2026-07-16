/**
 * Background worker process entry point.
 *
 * Started automatically by start-dev.sh (dev:stack).
 */

import { getRedisTargetDescription, isRedisConfigured } from "@/src/lib/queues/redis";
import { QUEUE_NAMES } from "@/src/lib/queues/queues";
import {
  assertValidBullMqQueueName,
  listBullMqQueueNames,
} from "@/src/lib/queues/queue-names";
import { logger } from "@/src/lib/logger";
import { startWorkers } from "@/workers/registry";
import { registerWorkerProcessShutdown } from "@/workers/shutdown";

const workerLog = logger.child({ component: "workers" });

async function main(): Promise<void> {
  if (!isRedisConfigured()) {
    workerLog.error("Redis is not configured — set REDIS_HOST/REDIS_PORT or REDIS_URL");
    process.exit(1);
  }

  const target = getRedisTargetDescription();
  workerLog.info({ redis: target ?? "unknown" }, "starting background workers");

  for (const queueName of listBullMqQueueNames()) {
    assertValidBullMqQueueName(queueName);
  }

  const shutdown = await startWorkers();
  registerWorkerProcessShutdown(shutdown);

  process.on("unhandledRejection", (reason) => {
    workerLog.error({ err: reason }, "unhandledRejection");
  });

  process.on("uncaughtException", (err) => {
    workerLog.error({ err }, "uncaughtException");
  });

  const uniqueQueues = [...new Set(Object.values(QUEUE_NAMES))];
  workerLog.info({ queues: uniqueQueues }, "workers listening");
}

main().catch((e) => {
  workerLog.fatal({ err: e }, "worker process failed to start");
  process.exit(1);
});
