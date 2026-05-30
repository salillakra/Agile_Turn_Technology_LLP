import { embedTextWithDedupeAndCache } from "@/src/lib/ai/embedding-text-cache";
import type { RecruiterSearchResultRow } from "@/src/lib/ai/recruiter-search";
import { getConfiguredEmbeddingModel } from "@/src/lib/ai-service-client";
import { consumeRecruiterSearchEmbedRateLimit } from "@/src/lib/ai/recruiter-search-rate-limit";
import {
  buildRbacScopeKey,
  normalizeCacheQuery,
  recruiterSearchEmbedKey,
  recruiterSearchResultsKey,
} from "@/src/lib/cache/cache-keys";
import {
  cacheDelete,
  cacheExists,
  getCache,
  readPositiveIntEnv,
  setCache,
} from "@/src/lib/cache/cache-utils";
import { PGVECTOR_EMBEDDING_DIMENSION } from "@/src/lib/pgvector-utils";

/** Default 20 minutes — within recommended 15–30 minute window. */
const DEFAULT_RECRUITER_SEARCH_CACHE_TTL_SEC = 1_200;

const MIN_RECRUITER_SEARCH_CACHE_TTL_SEC = 900;
const MAX_RECRUITER_SEARCH_CACHE_TTL_SEC = 1_800;

export type RecruiterSearchCacheLayer = "hit" | "miss";

export type RecruiterSearchCacheStatus = {
  embedding: RecruiterSearchCacheLayer;
  results: RecruiterSearchCacheLayer;
};

type CachedEmbeddingPayload = {
  model: string;
  embedding: number[];
  cachedAt: string;
};

type CachedResultsPayload = {
  results: RecruiterSearchResultRow[];
  cachedAt: string;
};

/**
 * Canonical query for cache keys and embedding input (trim, lowercase, collapsed whitespace).
 */
export function normalizeRecruiterSearchQuery(query: string): string {
  return normalizeCacheQuery(query);
}

function recruiterSearchCacheTtlMs(): number {
  const raw = readPositiveIntEnv(
    "RECRUITER_SEARCH_CACHE_TTL_SEC",
    DEFAULT_RECRUITER_SEARCH_CACHE_TTL_SEC
  );
  const clamped = Math.min(
    MAX_RECRUITER_SEARCH_CACHE_TTL_SEC,
    Math.max(MIN_RECRUITER_SEARCH_CACHE_TTL_SEC, raw)
  );
  return clamped * 1000;
}

function isValidEmbedding(vector: unknown): vector is number[] {
  return (
    Array.isArray(vector) &&
    vector.length === PGVECTOR_EMBEDDING_DIMENSION &&
    vector.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Resolve query embedding: Redis → AI `/embed` on miss. Caches only successful embeddings.
 */
export async function resolveRecruiterQueryEmbedding(
  query: string,
  options?: { userId?: string }
): Promise<
  | { ok: true; embedding: number[]; cache: RecruiterSearchCacheLayer; normalizedQuery: string }
  | { ok: false; error: string; status?: number; code?: "RATE_LIMITED" }
> {
  const normalizedQuery = normalizeRecruiterSearchQuery(query);
  if (!normalizedQuery) {
    return { ok: false, error: "query is required", status: 400 };
  }

  const model = getConfiguredEmbeddingModel();
  const key = recruiterSearchEmbedKey(normalizedQuery, model);

  const embedCached = await getCache<CachedEmbeddingPayload>(key);
  if (
    embedCached.hit &&
    embedCached.value?.model === model &&
    isValidEmbedding(embedCached.value.embedding)
  ) {
    return {
      ok: true,
      embedding: embedCached.value.embedding,
      cache: "hit",
      normalizedQuery,
    };
  }

  const userId = options?.userId?.trim();
  if (userId) {
    const embedLimit = await consumeRecruiterSearchEmbedRateLimit(userId);
    if (embedLimit.ok === false) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        error: `Embedding rate limit exceeded; retry after ${embedLimit.retryAfterSeconds} second(s)`,
        status: 429,
      };
    }
  }

  const embedded = await embedTextWithDedupeAndCache(normalizedQuery, {
    redisKey: key,
    ttlMs: recruiterSearchCacheTtlMs(),
  });
  if (embedded.ok === false) {
    return { ok: false, error: embedded.error, status: embedded.status };
  }

  const cacheLayer = embedded.source === "network" ? "miss" : "hit";

  return {
    ok: true,
    embedding: embedded.embedding,
    cache: cacheLayer,
    normalizedQuery,
  };
}

export type GetCachedRecruiterSearchResultsParams = {
  /** Raw or normalized query — normalized inside key builders. */
  query: string;
  role: string | undefined;
  userId: string | undefined;
  limit: number;
  minCosineSimilarity?: number;
};

export async function getCachedRecruiterSearchResults(
  params: GetCachedRecruiterSearchResultsParams
): Promise<RecruiterSearchResultRow[] | null> {
  const normalizedQuery = normalizeRecruiterSearchQuery(params.query);
  if (!normalizedQuery) return null;

  const model = getConfiguredEmbeddingModel();
  const scopeKey = buildRbacScopeKey(params.role, params.userId);
  const key = recruiterSearchResultsKey({
    query: normalizedQuery,
    model,
    scopeKey,
    limit: params.limit,
    minCosineSimilarity: params.minCosineSimilarity,
  });

  const { hit, value } = await getCache<CachedResultsPayload>(key);
  if (!hit || !value || !Array.isArray(value.results)) return null;
  return value.results;
}

/**
 * Store top hybrid-ranked candidates after a **successful** search (no embedding/rate-limit errors).
 * Does not write on failed searches — callers must only invoke when `searchCandidatesByRecruiterQuery` succeeds.
 */
export async function setCachedRecruiterSearchResults(
  params: GetCachedRecruiterSearchResultsParams & {
    results: readonly RecruiterSearchResultRow[];
    successful: boolean;
  }
): Promise<void> {
  if (!params.successful) return;

  const normalizedQuery = normalizeRecruiterSearchQuery(params.query);
  if (!normalizedQuery) return;

  const model = getConfiguredEmbeddingModel();
  const scopeKey = buildRbacScopeKey(params.role, params.userId);
  const key = recruiterSearchResultsKey({
    query: normalizedQuery,
    model,
    scopeKey,
    limit: params.limit,
    minCosineSimilarity: params.minCosineSimilarity,
  });

  const payload: CachedResultsPayload = {
    results: [...params.results],
    cachedAt: new Date().toISOString(),
  };

  await setCache(key, payload, { ttlMs: recruiterSearchCacheTtlMs() });
}

export async function peekRecruiterQueryEmbeddingCache(
  query: string
): Promise<RecruiterSearchCacheLayer> {
  const normalizedQuery = normalizeRecruiterSearchQuery(query);
  if (!normalizedQuery) return "miss";
  const key = recruiterSearchEmbedKey(normalizedQuery, getConfiguredEmbeddingModel());
  const exists = await cacheExists(key);
  return exists ? "hit" : "miss";
}

export async function invalidateRecruiterSearchResultsCache(
  params: GetCachedRecruiterSearchResultsParams
): Promise<void> {
  const normalizedQuery = normalizeRecruiterSearchQuery(params.query);
  if (!normalizedQuery) return;

  const model = getConfiguredEmbeddingModel();
  const scopeKey = buildRbacScopeKey(params.role, params.userId);
  const key = recruiterSearchResultsKey({
    query: normalizedQuery,
    model,
    scopeKey,
    limit: params.limit,
    minCosineSimilarity: params.minCosineSimilarity,
  });

  await cacheDelete(key);
}

export function getRecruiterSearchCacheTtlMs(): number {
  return recruiterSearchCacheTtlMs();
}
