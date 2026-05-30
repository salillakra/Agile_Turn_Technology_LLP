import { getConfiguredEmbeddingModel } from "@/src/lib/ai-service-client";
import { HYBRID_CANDIDATE_FIT_WEIGHTS } from "@/src/lib/ai/candidate-scoring-weights";
import type { CandidateScoringThresholds } from "@/src/lib/ai/candidate-scoring-thresholds";
import {
  buildCandidateScoringScopeKey,
  candidateScoringCandidateTagKey,
  candidateScoringFitKey,
  candidateScoringJobPatterns,
  candidateScoringJobTagKey,
  candidateScoringPopularityKey,
  candidateScoringResultsKey,
  candidateScoringSemanticKey,
  sha256CacheHash,
} from "@/src/lib/cache/cache-keys";
import {
  cacheIncrement,
  getCache,
  invalidateCacheByTag,
  invalidatePattern,
  readPositiveIntEnv,
  registerCacheForTags,
  setCache,
} from "@/src/lib/cache/cache-utils";
import type { PgvectorSimilarityRankRow } from "@/src/lib/pgvector-similarity";

/** Default TTL for full scored result lists (5 min). */
const DEFAULT_SCORES_TTL_SEC = 300;

/** Default TTL for pgvector semantic ranking rows (10 min). */
const DEFAULT_SEMANTIC_TTL_SEC = 600;

/** Default TTL for per-candidate hybrid fit rows (10 min). */
const DEFAULT_FIT_TTL_SEC = 600;

/** Extended TTL for frequently requested job score lists (15 min). */
const DEFAULT_POPULAR_SCORES_TTL_SEC = 900;

const POPULAR_HIT_THRESHOLD = 3;

export const HYBRID_FIT_ENGINE_FINGERPRINT = sha256CacheHash(
  JSON.stringify(HYBRID_CANDIDATE_FIT_WEIGHTS)
);

export type CandidateScoringCacheLayer = "hit" | "miss";

export type CandidateScoringCacheStatus = {
  /** `skipped` when full score list was served from cache (semantic not queried). */
  semanticRanking: CandidateScoringCacheLayer | "skipped";
  /** Full ranked hybrid output list for the job. */
  results: CandidateScoringCacheLayer;
  /** Per-candidate `candidateFitScore` hybrid rows. */
  hybridFit: CandidateScoringCacheLayer | "skipped";
};

type CachedSemanticRankingPayload = {
  rows: PgvectorSimilarityRankRow[];
  cachedAt: string;
};

export type CachedCandidateFitPayload = {
  candidateFitScore: number;
  semanticScore: number;
  matchedSkills: string[];
  recommendationReasons: string[];
  cachedAt: string;
};

export type CachedCandidateScoresPayload = {
  results: unknown[];
  thresholds: CandidateScoringThresholds;
  minScore: number;
  limit: number;
  cachedAt: string;
  popularHits?: number;
};

export { buildCandidateScoringScopeKey };

function scoresTtlSec(popular: boolean): number {
  if (popular) {
    return readPositiveIntEnv(
      "CANDIDATE_SCORING_POPULAR_CACHE_TTL_SEC",
      DEFAULT_POPULAR_SCORES_TTL_SEC
    );
  }
  return readPositiveIntEnv("CANDIDATE_SCORING_RESULTS_CACHE_TTL_SEC", DEFAULT_SCORES_TTL_SEC);
}

function semanticTtlSec(): number {
  return readPositiveIntEnv("CANDIDATE_SCORING_SEMANTIC_CACHE_TTL_SEC", DEFAULT_SEMANTIC_TTL_SEC);
}

function fitTtlSec(): number {
  return readPositiveIntEnv("CANDIDATE_SCORING_FIT_CACHE_TTL_SEC", DEFAULT_FIT_TTL_SEC);
}

export function fingerprintCandidateIds(candidateIds: readonly string[]): string {
  const sorted = [...candidateIds].sort();
  return sha256CacheHash(sorted.join(","));
}

export function jobConfigFingerprint(params: {
  jobId: string;
  jobMeta: unknown;
  requiredSkills: readonly string[];
  preferredSkills: readonly string[];
  yearsOfExperience: number | null;
  location: string;
  title: string;
  hasEmbedding: boolean;
}): string {
  const material = [
    params.jobId,
    JSON.stringify(params.jobMeta ?? null),
    params.requiredSkills.join("|"),
    params.preferredSkills.join("|"),
    String(params.yearsOfExperience ?? ""),
    params.location,
    params.title,
    params.hasEmbedding ? "1" : "0",
    getConfiguredEmbeddingModel(),
  ].join("::");
  return sha256CacheHash(material);
}

/** Job inputs that affect hybrid scoring, including embedding freshness. */
export function scoringJobFingerprint(params: {
  jobId: string;
  jobMeta: unknown;
  requiredSkills: readonly string[];
  preferredSkills: readonly string[];
  yearsOfExperience: number | null;
  location: string;
  title: string;
  embedding: unknown;
  embeddingUpdatedAt: Date | null;
}): string {
  const base = jobConfigFingerprint({
    jobId: params.jobId,
    jobMeta: params.jobMeta,
    requiredSkills: params.requiredSkills,
    preferredSkills: params.preferredSkills,
    yearsOfExperience: params.yearsOfExperience,
    location: params.location,
    title: params.title,
    hasEmbedding: params.embedding != null,
  });
  const embedStamp = params.embeddingUpdatedAt?.toISOString() ?? "none";
  return sha256CacheHash(`${base}::${embedStamp}`);
}

/** Candidate profile inputs that affect hybrid fit for one job. */
export function candidateProfileFingerprint(params: {
  candidateId: string;
  normalizedSkills: readonly string[];
  totalExperience: number | null;
  relevantExperience: number | null;
  preferredWorkLocation: string | null;
  currentDesignation: string | null;
  hasEmbedding: boolean;
  embeddingUpdatedAt: Date | null;
  profileUpdatedAt: Date | null;
}): string {
  const material = [
    params.candidateId,
    params.normalizedSkills.join("|"),
    String(params.totalExperience ?? ""),
    String(params.relevantExperience ?? ""),
    params.preferredWorkLocation ?? "",
    params.currentDesignation ?? "",
    params.hasEmbedding ? "1" : "0",
    params.embeddingUpdatedAt?.toISOString() ?? "none",
    params.profileUpdatedAt.toISOString(),
    getConfiguredEmbeddingModel(),
  ].join("::");
  return sha256CacheHash(material);
}

export async function getCachedJobSemanticRanking(params: {
  jobId: string;
  scopeKey: string;
  jobFingerprint: string;
  candidateFingerprint: string;
  limit: number;
}): Promise<PgvectorSimilarityRankRow[] | null> {
  const key = candidateScoringSemanticKey(params);

  const { hit, value } = await getCache<CachedSemanticRankingPayload>(key);
  if (!hit || !value || !Array.isArray(value.rows)) return null;
  return value.rows;
}

export async function setCachedJobSemanticRanking(params: {
  jobId: string;
  scopeKey: string;
  jobFingerprint: string;
  candidateFingerprint: string;
  limit: number;
  rows: readonly PgvectorSimilarityRankRow[];
}): Promise<void> {
  const key = candidateScoringSemanticKey(params);
  const ttlSec = semanticTtlSec();

  const payload: CachedSemanticRankingPayload = {
    rows: [...params.rows],
    cachedAt: new Date().toISOString(),
  };

  const { ok } = await setCache(key, payload, { ttlSec });
  if (!ok) return;

  await registerCacheForTags(key, [candidateScoringJobTagKey(params.jobId)], ttlSec);
}

export async function getCachedCandidateFit(params: {
  jobId: string;
  candidateId: string;
  jobFingerprint: string;
  candidateFingerprint: string;
}): Promise<CachedCandidateFitPayload | null> {
  const key = candidateScoringFitKey({
    ...params,
    engineFingerprint: HYBRID_FIT_ENGINE_FINGERPRINT,
  });

  const { hit, value } = await getCache<CachedCandidateFitPayload>(key);
  if (!hit || !value || typeof value.candidateFitScore !== "number") return null;
  return value;
}

export async function setCachedCandidateFit(params: {
  jobId: string;
  candidateId: string;
  jobFingerprint: string;
  candidateFingerprint: string;
  payload: CachedCandidateFitPayload;
}): Promise<void> {
  const key = candidateScoringFitKey({
    jobId: params.jobId,
    candidateId: params.candidateId,
    jobFingerprint: params.jobFingerprint,
    candidateFingerprint: params.candidateFingerprint,
    engineFingerprint: HYBRID_FIT_ENGINE_FINGERPRINT,
  });
  const ttlSec = fitTtlSec();
  const { ok } = await setCache(key, params.payload, { ttlSec });
  if (!ok) return;

  await registerCacheForTags(
    key,
    [
      candidateScoringJobTagKey(params.jobId),
      candidateScoringCandidateTagKey(params.candidateId),
    ],
    ttlSec
  );
}

export async function getCachedCandidateScores(params: {
  jobId: string;
  scopeKey: string;
  limit: number;
  minScore: number;
  thresholds: CandidateScoringThresholds;
  jobFingerprint: string;
}): Promise<CachedCandidateScoresPayload | null> {
  const key = candidateScoringResultsKey({
    jobId: params.jobId,
    scopeKey: params.scopeKey,
    limit: params.limit,
    minScore: params.minScore,
    thresholds: params.thresholds,
    jobFingerprint: params.jobFingerprint,
    engineFingerprint: HYBRID_FIT_ENGINE_FINGERPRINT,
  });

  const { hit, value } = await getCache<CachedCandidateScoresPayload>(key);
  if (!hit || !value || !Array.isArray(value.results)) return null;
  return value;
}

export async function setCachedCandidateScores(params: {
  jobId: string;
  scopeKey: string;
  limit: number;
  minScore: number;
  thresholds: CandidateScoringThresholds;
  jobFingerprint: string;
  poolCandidateIds: readonly string[];
  results: readonly unknown[];
}): Promise<void> {
  const key = candidateScoringResultsKey({
    jobId: params.jobId,
    scopeKey: params.scopeKey,
    limit: params.limit,
    minScore: params.minScore,
    thresholds: params.thresholds,
    jobFingerprint: params.jobFingerprint,
    engineFingerprint: HYBRID_FIT_ENGINE_FINGERPRINT,
  });

  const hits = await recordJobScoresPopularity(params.jobId, params.scopeKey);
  const popular = hits >= POPULAR_HIT_THRESHOLD;
  const ttlSec = scoresTtlSec(popular);

  const payload: CachedCandidateScoresPayload = {
    results: [...params.results],
    thresholds: params.thresholds,
    minScore: params.minScore,
    limit: params.limit,
    cachedAt: new Date().toISOString(),
    popularHits: hits,
  };

  const { ok } = await setCache(key, payload, { ttlSec });
  if (!ok) return;

  const tagKeys = [
    candidateScoringJobTagKey(params.jobId),
    ...params.poolCandidateIds.map((id) => candidateScoringCandidateTagKey(id)),
  ];
  await registerCacheForTags(key, tagKeys, ttlSec);
}

/** Job profile or embedding changed — drop semantic, fit, and result caches for this job. */
export async function invalidateJobCandidateScoringCaches(jobId: string): Promise<void> {
  if (!jobId) return;
  for (const pattern of candidateScoringJobPatterns(jobId)) {
    await invalidatePattern(pattern, { maxKeys: 2_000 });
  }
  await invalidateCacheByTag(candidateScoringJobTagKey(jobId), 2_000);
}

/** Candidate profile or embedding changed — drop fit rows and lists that included this candidate. */
export async function invalidateCandidateScoringCaches(candidateId: string): Promise<void> {
  if (!candidateId) return;
  await invalidateCacheByTag(candidateScoringCandidateTagKey(candidateId), 2_000);
}

async function recordJobScoresPopularity(jobId: string, scopeKey: string): Promise<number> {
  const key = candidateScoringPopularityKey(jobId, scopeKey);
  const windowSec = readPositiveIntEnv(
    "CANDIDATE_SCORING_POPULAR_WINDOW_SEC",
    7 * 86_400
  );
  return cacheIncrement(key, windowSec);
}
