import { dashboardCacheKey } from "@/src/lib/cache/cache-keys";
import {
  getCache,
  setCache,
  stringifyCacheValue,
} from "@/src/lib/cache/cache-utils";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

/** In-process fallback when Redis is unset or Redis errors. */
const memoryCache = new Map<string, CacheEntry<unknown>>();

/**
 * Default TTL when callers omit explicit `ttlMs`.
 * Dashboard analytics routes use `getDashboardAnalyticsCacheTtlMs()` (5–15 min) via `dashboard-analytics-cache.ts`.
 */
export const DASHBOARD_CACHE_TTL_MS = 60_000;

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

export type DashboardCacheRead<T> = {
  value: T | null;
  /** True if a value was returned from Redis or in-memory store. */
  cacheHit: boolean;
};

/** Read cached JSON for dashboard GET handlers. Redis when available; else in-memory. */
export async function getDashboardCache<T>(logicalKey: string): Promise<DashboardCacheRead<T>> {
  const redisKey = dashboardCacheKey(logicalKey);
  const redisRead = await getCache<T>(redisKey);
  if (redisRead.hit && redisRead.value != null) {
    return { value: redisRead.value, cacheHit: true };
  }
  const mem = memoryGet<T>(logicalKey);
  if (mem != null) return { value: mem, cacheHit: true };
  return { value: null, cacheHit: false };
}

/** Store dashboard response with TTL (60s default). Always updates in-memory; also writes Redis when configured. */
export async function setDashboardCache<T>(
  logicalKey: string,
  value: T,
  ttlMs: number = DASHBOARD_CACHE_TTL_MS
): Promise<void> {
  memorySet(logicalKey, value, ttlMs);
  try {
    stringifyCacheValue(value);
  } catch (e) {
    console.error("[dashboard-cache] serialize failed; Redis write skipped", e);
    return;
  }
  await setCache(dashboardCacheKey(logicalKey), value, { ttlMs });
}
