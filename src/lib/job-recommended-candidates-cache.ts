import type { RecommendedCandidateApiRow } from "@/src/lib/candidate-recommendation-engine";
import { HYBRID_RECOMMENDATION_WEIGHTS } from "@/src/lib/candidate-recommendation-engine";
import {
  fingerprintCandidateIds,
  jobConfigFingerprint,
} from "@/src/lib/ai/candidate-scoring-cache";
import {
  buildRbacScopeKey,
  jobRecommendedCandidatesCandidateTagKey,
  jobRecommendedCandidatesJobTagKey,
  jobRecommendedCandidatesKey,
  jobRecommendedCandidatesPattern,
  sha256CacheHash,
} from "@/src/lib/cache/cache-keys";
import {
  getCache,
  invalidateCacheByTag,
  invalidatePattern,
  readPositiveIntEnv,
  registerCacheForTags,
  setCache,
} from "@/src/lib/cache/cache-utils";

/** Default 20 minutes — aligned with recruiter search cache (15–30 min window). */
const DEFAULT_JOB_RECOMMENDED_CACHE_TTL_SEC = 1_200;
const MIN_JOB_RECOMMENDED_CACHE_TTL_SEC = 900;
const MAX_JOB_RECOMMENDED_CACHE_TTL_SEC = 1_800;

const ENGINE_FINGERPRINT = sha256CacheHash(JSON.stringify(HYBRID_RECOMMENDATION_WEIGHTS));

export type JobRecommendedCandidatesCacheLayer = "hit" | "miss";

export type CachedJobRecommendedCandidatesMeta = {
  minScore: number;
  poolSize: number;
  resultCount: number;
  jobEmbeddingPresent: boolean;
};

export type CachedJobRecommendedCandidatesPayload = {
  rows: RecommendedCandidateApiRow[];
  meta: CachedJobRecommendedCandidatesMeta;
  cachedAt: string;
};

function jobRecommendedCacheTtlSec(): number {
  const raw = readPositiveIntEnv(
    "JOB_RECOMMENDED_CANDIDATES_CACHE_TTL_SEC",
    DEFAULT_JOB_RECOMMENDED_CACHE_TTL_SEC
  );
  return Math.min(
    MAX_JOB_RECOMMENDED_CACHE_TTL_SEC,
    Math.max(MIN_JOB_RECOMMENDED_CACHE_TTL_SEC, raw)
  );
}

export function buildJobRecommendedCandidatesScopeKey(
  role: string | undefined,
  userId: string | undefined
): string {
  return buildRbacScopeKey(role, userId);
}

export function recommendationJobFingerprint(params: {
  jobId: string;
  title: string;
  location: string;
  yearsOfExperience: number | null;
  requiredSkills: readonly string[];
  preferredSkills: readonly string[];
  jobMeta: unknown;
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

export function recommendationPoolFingerprint(candidateIds: readonly string[]): string {
  return fingerprintCandidateIds(candidateIds);
}

function buildCacheKeyForParams(params: {
  jobId: string;
  scopeKey: string;
  minScore: number;
  jobFingerprint: string;
}): string {
  return jobRecommendedCandidatesKey({
    jobId: params.jobId,
    scopeKey: params.scopeKey,
    minScore: params.minScore,
    jobFingerprint: params.jobFingerprint,
    engineFingerprint: ENGINE_FINGERPRINT,
  });
}

export async function getCachedJobRecommendedCandidates(params: {
  jobId: string;
  scopeKey: string;
  minScore: number;
  jobFingerprint: string;
}): Promise<{
  payload: CachedJobRecommendedCandidatesPayload | null;
  layer: JobRecommendedCandidatesCacheLayer;
}> {
  const key = buildCacheKeyForParams(params);
  const { hit, value } = await getCache<CachedJobRecommendedCandidatesPayload>(key);
  if (!hit || !value || !Array.isArray(value.rows)) {
    return { payload: null, layer: "miss" };
  }
  return { payload: value, layer: "hit" };
}

export async function setCachedJobRecommendedCandidates(params: {
  jobId: string;
  scopeKey: string;
  minScore: number;
  jobFingerprint: string;
  poolCandidateIds: readonly string[];
  payload: CachedJobRecommendedCandidatesPayload;
}): Promise<void> {
  const ttlSec = jobRecommendedCacheTtlSec();
  const key = buildCacheKeyForParams(params);
  const { ok } = await setCache(key, params.payload, { ttlSec });
  if (!ok) return;

  const tagKeys = [
    jobRecommendedCandidatesJobTagKey(params.jobId),
    ...params.poolCandidateIds.map((id) => jobRecommendedCandidatesCandidateTagKey(id)),
  ];
  await registerCacheForTags(key, tagKeys, ttlSec);
}

/** Job profile or embedding changed — drop all cached recommendation lists for this job. */
export async function invalidateJobRecommendedCandidatesCaches(jobId: string): Promise<void> {
  if (!jobId) return;
  await invalidatePattern(jobRecommendedCandidatesPattern(jobId), { maxKeys: 2_000 });
  await invalidateCacheByTag(jobRecommendedCandidatesJobTagKey(jobId), 2_000);
}

/** Candidate profile or embedding changed — drop cached lists that included this candidate. */
export async function invalidateCandidateRecommendedCandidatesCaches(
  candidateId: string
): Promise<void> {
  if (!candidateId) return;
  await invalidateCacheByTag(jobRecommendedCandidatesCandidateTagKey(candidateId), 2_000);
}
