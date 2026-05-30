import type Redis from "ioredis";
import { isRedisConfigured } from "@/src/lib/redis-config";
import { getSharedRedisClient } from "@/src/lib/redis-connection";

/**
 * Redis client for ATS cache workloads only.
 *
 * Backed by ioredis via `getSharedRedisClient("cache")` — one process-wide connection,
 * `maxRetriesPerRequest: 2`, shared error backoff in `redis-connection.ts`.
 *
 * For JSON get/set helpers use `cache-utils.ts`. For key names use `cache-keys.ts`.
 * Do not use for BullMQ — use `getBullMqRedisConnection()`.
 */

/** Bump when cache payload shapes change (invalidates by namespace migration). */
export const ATS_CACHE_VERSION = "v1";

export const ATS_CACHE_ROOT = "ats";

/** Whether Redis env is configured (`REDIS_URL` or `REDIS_HOST`). */
export function isCacheRedisAvailable(): boolean {
  return isRedisConfigured();
}

/**
 * Shared ioredis instance for cache reads/writes.
 * Returns `null` when Redis is unset or temporarily disabled after connection errors.
 */
export function getCacheRedisClient(): Redis | null {
  if (!isRedisConfigured()) return null;
  return getSharedRedisClient("cache");
}

/** Lightweight health probe for ops (PING). */
export async function pingCacheRedis(): Promise<"PONG" | "unconfigured" | "error"> {
  const redis = getCacheRedisClient();
  if (!redis) return "unconfigured";
  try {
    const res = await redis.ping();
    return res === "PONG" ? "PONG" : "error";
  } catch {
    return "error";
  }
}
