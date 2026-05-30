/**
 * Redis cache + in-flight deduplication for `POST /embed` (identical semantic text + model).
 *
 * Used by job/candidate embedding workers and (with explicit `redisKey`) recruiter query embeddings
 * so concurrent identical work shares one AI call and repeated text does not re-hit the service until TTL.
 */

import type { EmbedTextResult, EmbeddingClientOptions } from "@/src/lib/ai/embedding-client";
import { embedText } from "@/src/lib/ai/embedding-client";
import { getConfiguredEmbeddingModel } from "@/src/lib/ai-service-client";
import { embeddingTextVectorKey } from "@/src/lib/cache/cache-keys";
import { getCache, readPositiveIntEnv, setCache } from "@/src/lib/cache/cache-utils";
import { PGVECTOR_EMBEDDING_DIMENSION } from "@/src/lib/pgvector-utils";

/** Default 24h — entity semantic text rarely oscillates; TTL bounds stale vectors after model change. */
const DEFAULT_EMBEDDING_TEXT_CACHE_TTL_SEC = 86_400;
const MIN_EMBEDDING_TEXT_CACHE_TTL_SEC = 300;
const MAX_EMBEDDING_TEXT_CACHE_TTL_SEC = 604_800;

export type EmbedTextCacheOptions = EmbeddingClientOptions & {
  /**
   * Use this Redis key instead of the default `embeddingTextVectorKey` (e.g. recruiter search
   * `recruiterSearchEmbedKey` so TTL and namespace stay aligned with existing search cache).
   */
  redisKey?: string;
  /** TTL for new entries (ms). When omitted, uses `EMBEDDING_TEXT_CACHE_TTL_SEC` (entity default). */
  ttlMs?: number;
};

type CachedVecPayload = {
  model: string;
  embedding: number[];
  cachedAt: string;
};

export type EmbedTextCachedSuccess = {
  ok: true;
  embedding: number[];
  /** `redis-hit` from Redis; `network` this execution called AI; `deduped` awaited another in-flight run. */
  source: "redis-hit" | "network" | "deduped";
};

export type EmbedTextCachedResult = EmbedTextCachedSuccess | { ok: false; error: string; status?: number };

const pending = new Map<string, Promise<EmbedTextCachedResult>>();

function embeddingTextCacheTtlMs(): number {
  const raw = readPositiveIntEnv(
    "EMBEDDING_TEXT_CACHE_TTL_SEC",
    DEFAULT_EMBEDDING_TEXT_CACHE_TTL_SEC
  );
  const clamped = Math.min(
    MAX_EMBEDDING_TEXT_CACHE_TTL_SEC,
    Math.max(MIN_EMBEDDING_TEXT_CACHE_TTL_SEC, raw)
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

function mapAwaiterResult(r: EmbedTextCachedResult): EmbedTextCachedResult {
  if (r.ok && r.source === "redis-hit") return r;
  if (r.ok) return { ok: true, embedding: r.embedding, source: "deduped" };
  return r;
}

/**
 * Resolve embedding: Redis → single shared in-flight request → AI `/embed` on true miss.
 * Writes Redis only on successful finite-dimension vectors.
 */
export async function embedTextWithDedupeAndCache(
  text: string,
  options?: EmbedTextCacheOptions
): Promise<EmbedTextCachedResult> {
  const { redisKey, ttlMs: ttlMsOpt, ...clientOptions } = options ?? {};
  const model = getConfiguredEmbeddingModel();
  const toEmbed = text.trim();
  if (!toEmbed) {
    return { ok: false, error: "Semantic text is empty" };
  }

  const cacheKey = redisKey ?? embeddingTextVectorKey(toEmbed, model);
  const ttlMs = ttlMsOpt ?? embeddingTextCacheTtlMs();

  const inflight = pending.get(cacheKey);
  if (inflight) {
    return mapAwaiterResult(await inflight);
  }

  let settle!: (r: EmbedTextCachedResult) => void;
  const gate = new Promise<EmbedTextCachedResult>((resolve) => {
    settle = resolve;
  });
  pending.set(cacheKey, gate);

  void (async () => {
    try {
      const cached = await getCache<CachedVecPayload>(cacheKey);
      if (
        cached.hit &&
        cached.value?.model === model &&
        isValidEmbedding(cached.value.embedding)
      ) {
        settle({ ok: true, embedding: cached.value.embedding, source: "redis-hit" });
        return;
      }

      const out: EmbedTextResult = await embedText(toEmbed, clientOptions);
      if (out.ok === false) {
        settle(out);
        return;
      }
      if (!isValidEmbedding(out.embedding)) {
        settle({ ok: false, error: "Invalid embedding vector from AI service", status: 503 });
        return;
      }

      await setCache(
        cacheKey,
        {
          model,
          embedding: out.embedding,
          cachedAt: new Date().toISOString(),
        },
        { ttlMs }
      );
      settle({ ok: true, embedding: out.embedding, source: "network" });
    } catch (e) {
      settle({
        ok: false,
        error: e instanceof Error ? e.message : "Embedding cache pipeline failed",
      });
    } finally {
      pending.delete(cacheKey);
    }
  })();

  return await gate;
}
