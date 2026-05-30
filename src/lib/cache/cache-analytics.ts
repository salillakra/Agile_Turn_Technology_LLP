import { getCacheRedisClient } from "@/src/lib/cache/redis-cache";
import { readPositiveIntEnv } from "@/src/lib/cache/cache-utils";

const METRICS_PREFIX = "ats:cache:metrics:v1:";
const TOP_HITS_ZSET = `${METRICS_PREFIX}top_hits`;
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;
function ttlSec(): number {
  return Math.max(60, readPositiveIntEnv("CACHE_ANALYTICS_TTL_SEC", DEFAULT_TTL_SEC));
}

export type CacheAnalyticsLayer = "hit" | "miss" | "n/a";

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\s+/g, " ");
}

function endpointKey(endpoint: string): string {
  return `${METRICS_PREFIX}endpoint:${encodeURIComponent(endpoint)}`;
}

/**
 * Record one cache observation for an endpoint.
 * Stores counts + response time sums to compute hit rate and avg hit/miss latency.
 */
export async function recordCacheAnalyticsEvent(params: {
  endpoint: string;
  cache: CacheAnalyticsLayer;
  responseTimeMs: number;
}): Promise<void> {
  const redis = getCacheRedisClient();
  if (!redis) return;

  const endpoint = normalizeEndpoint(params.endpoint);
  if (!endpoint) return;

  const cache = params.cache;
  if (cache !== "hit" && cache !== "miss") return;

  const ms = Math.max(0, Math.trunc(params.responseTimeMs));
  const key = endpointKey(endpoint);
  const multi = redis.multi();

  if (cache === "hit") {
    multi.hincrby(key, "hits", 1);
    multi.hincrby(key, "hit_ms_sum", ms);
    multi.hincrby(key, "hit_ms_count", 1);
    multi.zincrby(TOP_HITS_ZSET, 1, endpoint);
  } else {
    multi.hincrby(key, "misses", 1);
    multi.hincrby(key, "miss_ms_sum", ms);
    multi.hincrby(key, "miss_ms_count", 1);
  }

  const ttl = ttlSec();
  multi.expire(key, ttl);
  multi.expire(TOP_HITS_ZSET, ttl);

  try {
    await multi.exec();
  } catch {
    // best-effort
  }
}

export type CacheAnalyticsEndpointRow = {
  endpoint: string;
  hits: number;
  misses: number;
  hitRate: number;
  avgHitMs: number | null;
  avgMissMs: number | null;
  avgImprovementMs: number | null;
};

function toInt(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function safeDiv(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round(sum / count);
}

export async function readCacheAnalytics(params?: {
  topN?: number;
}): Promise<{ top: CacheAnalyticsEndpointRow[] }> {
  const redis = getCacheRedisClient();
  if (!redis) return { top: [] };

  const topN = Math.max(1, Math.min(50, Math.trunc(params?.topN ?? 10)));
  let endpoints: string[] = [];
  try {
    endpoints = await redis.zrevrange(TOP_HITS_ZSET, 0, topN - 1);
  } catch {
    endpoints = [];
  }

  const rows: CacheAnalyticsEndpointRow[] = [];
  for (const endpoint of endpoints) {
    try {
      const key = endpointKey(endpoint);
      const m = await redis.hgetall(key);
      const hits = toInt(m.hits);
      const misses = toInt(m.misses);
      const total = hits + misses;
      const hitRate = total > 0 ? hits / total : 0;

      const avgHitMs = safeDiv(toInt(m.hit_ms_sum), toInt(m.hit_ms_count));
      const avgMissMs = safeDiv(toInt(m.miss_ms_sum), toInt(m.miss_ms_count));
      const avgImprovementMs =
        avgHitMs != null && avgMissMs != null ? Math.max(0, avgMissMs - avgHitMs) : null;

      rows.push({
        endpoint,
        hits,
        misses,
        hitRate,
        avgHitMs,
        avgMissMs,
        avgImprovementMs,
      });
    } catch {
      // skip
    }
  }

  return { top: rows };
}

