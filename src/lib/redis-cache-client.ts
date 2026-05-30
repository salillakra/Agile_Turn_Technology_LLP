/**
 * @deprecated Import from `@/src/lib/cache` or `@/src/lib/cache/cache-utils`.
 * Kept for backward compatibility.
 */
export {
  ATS_CACHE_ROOT,
  ATS_CACHE_VERSION,
  getCacheRedisClient,
  isCacheRedisAvailable,
  pingCacheRedis,
} from "@/src/lib/cache/redis-cache";

export {
  cacheDelete,
  cacheExists,
  cacheGetJson,
  cacheIncrement,
  cacheSetJson,
  deleteCache,
  getCache,
  invalidatePattern,
  parseCacheValue,
  setCache,
  stringifyCacheValue,
  type CacheRead as CacheRedisRead,
  type CacheSetOptions as CacheRedisSetOptions,
  type GetCacheResult,
  type InvalidatePatternResult,
  type SetCacheOptions,
} from "@/src/lib/cache/cache-utils";
