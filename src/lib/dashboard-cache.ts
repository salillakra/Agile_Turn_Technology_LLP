import Redis from "ioredis";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

/** In-process fallback when `REDIS_URL` is unset or Redis errors. */
const memoryCache = new Map<string, CacheEntry<unknown>>();

/** Dashboard API cache TTL: 60 seconds (summary + charts routes). */
export const DASHBOARD_CACHE_TTL_MS = 60_000;

const REDIS_KEY_PREFIX = "recruitment:dashboard:v1:";

let redisClient: Redis | null = null;
let redisDisabledUntil = 0;
const REDIS_BACKOFF_MS = 30_000;

function redisUrl(): string | undefined {
  return process.env.REDIS_URL?.trim() || undefined;
}

function getRedisClient(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  if (Date.now() < redisDisabledUntil) return null;
  if (redisClient) return redisClient;
  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on("error", () => {
      redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
      try {
        void redisClient?.quit();
      } catch {
        /* ignore */
      }
      redisClient = null;
    });
    redisClient = client;
    return client;
  } catch {
    redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
    return null;
  }
}

function memoryGet<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function memorySet<T>(key: string, value: T, ttlMs: number): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function redisKey(cacheKey: string): string {
  return `${REDIS_KEY_PREFIX}${cacheKey}`;
}

export type DashboardCacheRead<T> = {
  value: T | null;
  /** True if a value was returned from Redis or in-memory store. */
  cacheHit: boolean;
};

/** Read cached JSON for dashboard GET handlers. Redis when available; else in-memory. */
export async function getDashboardCache<T>(key: string): Promise<DashboardCacheRead<T>> {
  const r = getRedisClient();
  if (r) {
    try {
      const raw = await r.get(redisKey(key));
      if (raw != null) {
        return { value: JSON.parse(raw) as T, cacheHit: true };
      }
    } catch {
      redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
    }
  }
  const mem = memoryGet<T>(key);
  if (mem != null) return { value: mem, cacheHit: true };
  return { value: null, cacheHit: false };
}

function stringifyForCache(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Store dashboard response with TTL (60s default). Always updates in-memory; also writes Redis when configured. */
export async function setDashboardCache<T>(
  key: string,
  value: T,
  ttlMs: number = DASHBOARD_CACHE_TTL_MS
): Promise<void> {
  memorySet(key, value, ttlMs);
  let serialized: string;
  try {
    serialized = stringifyForCache(value);
  } catch (e) {
    console.error("[dashboard-cache] serialize failed; Redis write skipped", e);
    return;
  }
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  const r = getRedisClient();
  if (r) {
    try {
      await r.set(redisKey(key), serialized, "EX", ttlSec);
    } catch {
      redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
    }
  }
}
