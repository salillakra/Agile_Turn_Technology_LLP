/**
 * BullMQ Redis connections for `src/lib/queues` and `workers/`.
 *
 * Wraps `@/src/lib/redis-connection` with queue-specific rules:
 * - Producers/workers must fail fast when Redis is unset (no silent null).
 * - Workers should use a dedicated connection (`createWorkerRedisConnection`).
 */

import type { ConnectionOptions } from "bullmq";
import type Redis from "ioredis";
import {
  closeSharedRedisClients,
  createRedisClient,
  getBullMqRedisConnection,
  getRedisTargetDescription,
} from "@/src/lib/redis-connection";
import { isRedisConfigured } from "@/src/lib/redis-config";

export type QueueRedisConnection = Redis;

function requireRedis(): Redis {
  const client = getBullMqRedisConnection();
  if (client) return client;

  // If env is configured but the shared client was temporarily disabled due to prior errors,
  // try creating a fresh BullMQ client rather than treating it as "not configured".
  if (isRedisConfigured()) {
    const fresh = createRedisClient({ purpose: "bullmq", optional: false });
    if (fresh) return fresh;
  }

  throw new Error(
    "Redis is not configured for BullMQ. Set REDIS_HOST/REDIS_PORT (and optional REDIS_PASSWORD) or REDIS_URL."
  );
}

/**
 * Shared BullMQ connection for API producers (`Queue.add`).
 * Uses `maxRetriesPerRequest: null` (required for BullMQ).
 */
export function getQueueRedisConnection(): QueueRedisConnection {
  return requireRedis();
}

/** BullMQ-compatible connection options (same underlying ioredis client). */
export function getQueueConnectionOptions(): ConnectionOptions {
  return getQueueRedisConnection();
}

/**
 * Dedicated connection for a `Worker` process or blocking consumer.
 * Prefer one instance per worker process; call `closeWorkerRedisConnection` on shutdown.
 */
export function createWorkerRedisConnection(): QueueRedisConnection {
  const client = createRedisClient({ purpose: "bullmq", optional: false });
  if (!client) {
    throw new Error("Failed to create BullMQ worker Redis connection.");
  }
  return client;
}

/**
 * One Redis client per BullMQ `Worker` so `Worker.close()` does not quit a shared client
 * still used by other workers (prevents lock/job corruption on shutdown).
 */
export function createWorkerRedisConnectionForWorker(): QueueRedisConnection {
  return createWorkerRedisConnection();
}

export async function closeWorkerRedisConnection(
  connection: QueueRedisConnection
): Promise<void> {
  if (connection.status === "end" || connection.status === "close") {
    return;
  }
  try {
    await connection.quit();
  } catch (err) {
    console.warn(
      "[redis] quit failed, disconnecting:",
      err instanceof Error ? err.message : err
    );
    try {
      connection.disconnect();
    } catch {
      /* ignore */
    }
  }
}

/** Graceful shutdown for API process shared clients. */
export async function closeQueueRedisConnections(): Promise<void> {
  await closeSharedRedisClients();
}

export { isRedisConfigured, getRedisTargetDescription };
