import {
  getCacheRedisClient,
  isCacheRedisAvailable,
  pingCacheRedis,
} from "@/src/lib/cache/redis-cache";

export type CacheSetOptions = {
  /** TTL in seconds (Redis `EX`). */
  ttlSec: number;
};

/** Options for {@link setCache} — provide `ttlSec` or `ttlMs` (converted to seconds). */
export type SetCacheOptions = {
  ttlSec?: number;
  ttlMs?: number;
};

export type CacheRead<T> = {
  value: T | null;
  hit: boolean;
};

export type GetCacheResult<T> = CacheRead<T>;

export type SetCacheResult = {
  ok: boolean;
};

export type DeleteCacheResult = {
  ok: boolean;
};

export type InvalidatePatternOptions = {
  /** Max keys to delete per call (safety cap). Default 500. */
  maxKeys?: number;
  /** `SCAN` count hint per iteration. Default 100. */
  scanCount?: number;
};

export type InvalidatePatternResult = {
  deleted: number;
  scanned: number;
  /** True when `maxKeys` stopped deletion early; run again or narrow pattern. */
  truncated: boolean;
};

export { isCacheRedisAvailable, pingCacheRedis };

/** JSON.stringify safe for API cache payloads (e.g. BigInt). */
export function stringifyCacheValue(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function parseCacheValue<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

export function ttlMsToSec(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

function resolveTtlSec(options: SetCacheOptions | CacheSetOptions): number | null {
  if ("ttlSec" in options && options.ttlSec != null) {
    return Math.max(1, Math.trunc(options.ttlSec));
  }
  const ms = "ttlMs" in options ? options.ttlMs : undefined;
  if (ms != null && Number.isFinite(ms)) {
    return ttlMsToSec(ms);
  }
  return null;
}

/**
 * Read and JSON-deserialize a cache entry.
 * On Redis miss, parse error, or connection failure: `{ hit: false, value: null }` (no throw).
 */
export async function getCache<T>(key: string): Promise<GetCacheResult<T>> {
  const redis = getCacheRedisClient();
  if (!redis) return { value: null, hit: false };

  try {
    const raw = await redis.get(key);
    if (raw == null) return { value: null, hit: false };
    const value = parseCacheValue<T>(raw);
    if (value == null && raw !== "null") {
      return { value: null, hit: false };
    }
    return { value, hit: true };
  } catch {
    return { value: null, hit: false };
  }
}

/**
 * JSON-serialize and store with TTL (`EX`).
 * Returns `{ ok: false }` when Redis is unavailable, serialization fails, or SET errors.
 */
export async function setCache(
  key: string,
  value: unknown,
  options: SetCacheOptions
): Promise<SetCacheResult> {
  const ttlSec = resolveTtlSec(options);
  if (ttlSec == null) return { ok: false };

  const redis = getCacheRedisClient();
  if (!redis) return { ok: false };

  let serialized: string;
  try {
    serialized = stringifyCacheValue(value);
  } catch {
    return { ok: false };
  }

  try {
    await redis.set(key, serialized, "EX", ttlSec);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Delete a single cache key. Never throws.
 */
export async function deleteCache(key: string): Promise<DeleteCacheResult> {
  const redis = getCacheRedisClient();
  if (!redis) return { ok: false };
  try {
    await redis.del(key);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Delete keys matching a Redis glob pattern via `SCAN` (not `KEYS`).
 *
 * Example patterns: `ats:v1:score:*:cljob123:*`, `ats:v1:search:results:*`
 * Prefer narrow patterns; use tag sets for large invalidations when available.
 */
export async function invalidatePattern(
  pattern: string,
  options: InvalidatePatternOptions = {}
): Promise<InvalidatePatternResult> {
  const redis = getCacheRedisClient();
  if (!redis) {
    return { deleted: 0, scanned: 0, truncated: false };
  }

  const maxKeys = Math.max(1, options.maxKeys ?? 500);
  const scanCount = Math.max(10, options.scanCount ?? 100);
  let cursor = "0";
  let deleted = 0;
  let scanned = 0;
  let truncated = false;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        scanCount
      );
      cursor = nextCursor;
      scanned += keys.length;

      if (keys.length === 0) continue;

      const remaining = maxKeys - deleted;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      const batch = keys.slice(0, remaining);
      if (batch.length > 0) {
        await redis.del(...batch);
        deleted += batch.length;
      }

      if (deleted >= maxKeys) {
        truncated = true;
        break;
      }
    } while (cursor !== "0");
  } catch {
    return { deleted, scanned, truncated };
  }

  return { deleted, scanned, truncated };
}

/** @deprecated Prefer {@link getCache}. */
export const cacheGetJson = getCache;

/** @deprecated Prefer {@link setCache}. */
export async function cacheSetJson(
  key: string,
  value: unknown,
  options: CacheSetOptions
): Promise<boolean> {
  const result = await setCache(key, value, { ttlSec: options.ttlSec });
  return result.ok;
}

/** @deprecated Prefer {@link deleteCache}. */
export async function cacheDelete(key: string): Promise<void> {
  await deleteCache(key);
}

export async function cacheExists(key: string): Promise<boolean> {
  const redis = getCacheRedisClient();
  if (!redis) return false;
  try {
    const n = await redis.exists(key);
    return n === 1;
  } catch {
    return false;
  }
}

/**
 * INCR with window TTL on first increment (popularity / access counters).
 */
/**
 * Associate a cache key with one or more tag sets (Redis `SADD`) for targeted invalidation.
 * Tag sets receive a TTL of `max(ttlSec * 2, ttlSec + 60)` seconds.
 */
export async function registerCacheForTags(
  cacheKey: string,
  tagKeys: readonly string[],
  ttlSec: number
): Promise<void> {
  const redis = getCacheRedisClient();
  if (!redis || tagKeys.length === 0) return;

  const tagTtl = Math.max(Math.trunc(ttlSec) * 2, Math.trunc(ttlSec) + 60);
  try {
    const pipeline = redis.pipeline();
    for (const tag of tagKeys) {
      if (!tag) continue;
      pipeline.sadd(tag, cacheKey);
      pipeline.expire(tag, tagTtl);
    }
    await pipeline.exec();
  } catch {
    // Best-effort; stale tags expire on their own.
  }
}

/**
 * Delete all cache keys listed in a tag set, then delete the tag set itself.
 */
export async function invalidateCacheByTag(
  tagKey: string,
  maxKeys = 500
): Promise<number> {
  const redis = getCacheRedisClient();
  if (!redis) return 0;

  try {
    const members = await redis.smembers(tagKey);
    if (members.length === 0) {
      await redis.del(tagKey);
      return 0;
    }

    const batch = members.slice(0, Math.max(1, maxKeys));
    if (batch.length > 0) {
      await redis.del(...batch);
    }
    await redis.del(tagKey);
    return batch.length;
  } catch {
    return 0;
  }
}

/**
 * Acquire a best-effort Redis lock via `SET key value NX EX <ttlSec>`.
 * Returns false when Redis is unavailable or lock is held.
 */
export async function tryAcquireCacheLock(lockKey: string, ttlSec: number): Promise<boolean> {
  const redis = getCacheRedisClient();
  if (!redis) return false;
  try {
    const ttl = Math.max(1, Math.trunc(ttlSec));
    const result = await redis.set(lockKey, "1", "EX", ttl, "NX");
    return result === "OK";
  } catch {
    return false;
  }
}

export async function cacheIncrement(key: string, windowSec: number): Promise<number> {
  const redis = getCacheRedisClient();
  if (!redis) return 0;

  const window = Math.max(1, Math.trunc(windowSec));
  try {
    const hits = await redis.incr(key);
    if (hits === 1) {
      await redis.expire(key, window);
    }
    return hits;
  } catch {
    return 0;
  }
}
