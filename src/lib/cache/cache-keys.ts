import { createHash } from "node:crypto";
import { getConfiguredEmbeddingModel } from "@/src/lib/ai-service-client";
import type { CandidateScoringThresholds } from "@/src/lib/ai/candidate-scoring-thresholds";
import { ATS_CACHE_ROOT, ATS_CACHE_VERSION } from "@/src/lib/cache/redis-cache";

/**
 * Standardized Redis key generation for ATS caches.
 *
 * Format: `{ATS_CACHE_ROOT}:{version}:{domain}:{segment...}`
 * Example: `ats:v1:dashboard:summary:role:ADMIN:user:abc:range:30d`
 */

export type CacheDomain =
  | "dashboard"
  | "reports"
  | "search"
  | "score"
  | "rec"
  | "embed"
  | "rate"
  | "activity";

/** RBAC-scoped cache partition (recruiter search, candidate scoring, dashboard). */
export function buildRbacScopeKey(
  role: string | undefined,
  userId: string | undefined
): string {
  if (role === "ADMIN") return "scope:admin";
  if (userId) return `scope:user:${userId}`;
  return "scope:anonymous";
}

export function sha256CacheHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function normalizeCacheQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeCacheToken(value: string | null | undefined): string {
  if (value == null) return "all";
  const v = value.trim();
  return v === "" ? "all" : encodeURIComponent(v);
}

/** Core builder — all domain keys should go through this. */
export function buildCacheKey(domain: CacheDomain, ...segments: string[]): string {
  const parts = [ATS_CACHE_ROOT, ATS_CACHE_VERSION, domain, ...segments.filter(Boolean)];
  return parts.join(":");
}

// --- Dashboard ---

export function dashboardCacheKey(logicalKey: string): string {
  return buildCacheKey("dashboard", logicalKey);
}

/** Logical key for GET /api/dashboard/summary (wrapped by `dashboardCacheKey`). */
export function dashboardSummaryCacheLogicalKey(params: {
  role: string | undefined;
  userId: string | undefined;
  range: string;
  compare: boolean;
}): string {
  return [
    "summary",
    normalizeCacheToken(params.role),
    normalizeCacheToken(params.userId),
    normalizeCacheToken(params.range),
    params.compare ? "cmp" : "nocmp",
  ].join(":");
}

/** Logical key for GET /api/dashboard/charts (stage/source distributions, trends). */
export function dashboardChartsCacheLogicalKey(params: {
  role: string | undefined;
  userId: string | undefined;
  range: string;
}): string {
  return [
    "charts",
    normalizeCacheToken(params.role),
    normalizeCacheToken(params.userId),
    normalizeCacheToken(params.range),
  ].join(":");
}

/** Redis key for GET /api/pipeline/stats (per-stage counts). */
export function pipelineStatsCacheKey(params: {
  role: string | undefined;
  userId: string | undefined;
  jobId?: string | null;
}): string {
  return buildCacheKey(
    "dashboard",
    "pipeline",
    "stats",
    normalizeCacheToken(params.role),
    normalizeCacheToken(params.userId),
    `job:${normalizeCacheToken(params.jobId ?? null)}`
  );
}

// --- Reports (logical key consumed by dashboard-cache in-memory + Redis) ---

export function reportsCacheLogicalKey(params: {
  endpoint: string;
  role: string | undefined;
  userId: string | undefined;
  range?: string | null;
  jobId?: string | null;
  department?: string | null;
  type?: string | null;
  format?: string | null;
}): string {
  return [
    "reports",
    normalizeCacheToken(params.endpoint),
    `role:${normalizeCacheToken(params.role)}`,
    `user:${normalizeCacheToken(params.userId)}`,
    `range:${normalizeCacheToken(params.range)}`,
    `job:${normalizeCacheToken(params.jobId)}`,
    `dept:${normalizeCacheToken(params.department)}`,
    `type:${normalizeCacheToken(params.type)}`,
    `format:${normalizeCacheToken(params.format)}`,
  ].join(":");
}

// --- Recruiter AI search ---

export function recruiterSearchEmbedKey(query: string, model?: string): string {
  const m = model ?? getConfiguredEmbeddingModel();
  const normalized = normalizeCacheQuery(query);
  return buildCacheKey("search", "embed", m, sha256CacheHash(normalized));
}

export function recruiterSearchResultsKey(params: {
  query: string;
  model: string;
  scopeKey: string;
  limit: number;
  minCosineSimilarity?: number;
}): string {
  const normalized = normalizeCacheQuery(params.query);
  const min =
    params.minCosineSimilarity != null && Number.isFinite(params.minCosineSimilarity)
      ? String(params.minCosineSimilarity)
      : "none";
  const material = [
    params.model,
    params.scopeKey,
    String(params.limit),
    min,
    normalized,
  ].join("|");
  return buildCacheKey("search", "results", sha256CacheHash(material));
}

export function recruiterSearchPopularityKey(query: string): string {
  return buildCacheKey("search", "pop", sha256CacheHash(normalizeCacheQuery(query)));
}

// --- Shared text → embedding vector (Redis + in-flight dedupe; job/candidate workers) ---

/** Redis key for cached embedding of canonical semantic text (exact model + content hash). */
export function embeddingTextVectorKey(canonicalText: string, model: string): string {
  return buildCacheKey("embed", "vec", model, sha256CacheHash(canonicalText));
}

// --- Candidate scoring ---

export function candidateScoringSemanticKey(params: {
  jobId: string;
  scopeKey: string;
  jobFingerprint: string;
  candidateFingerprint: string;
  limit: number;
}): string {
  const material = [
    params.jobId,
    params.scopeKey,
    String(params.limit),
    params.jobFingerprint,
    params.candidateFingerprint,
  ].join("|");
  return buildCacheKey("score", "semantic", params.jobId, sha256CacheHash(material));
}

/** Per job×candidate hybrid fit (`candidateFitScore`, semantic, reasons). */
export function candidateScoringFitKey(params: {
  jobId: string;
  candidateId: string;
  jobFingerprint: string;
  candidateFingerprint: string;
  engineFingerprint: string;
}): string {
  const material = [
    params.jobId,
    params.candidateId,
    params.jobFingerprint,
    params.candidateFingerprint,
    params.engineFingerprint,
  ].join("|");
  return buildCacheKey("score", "fit", params.jobId, sha256CacheHash(material));
}

export function candidateScoringResultsKey(params: {
  jobId: string;
  scopeKey: string;
  limit: number;
  minScore: number;
  thresholds: CandidateScoringThresholds;
  jobFingerprint: string;
  engineFingerprint: string;
}): string {
  const thresholdMaterial = [
    String(params.thresholds.minimumAcceptableScore),
    String(params.thresholds.highPriorityThreshold),
    String(params.thresholds.autoShortlistThreshold),
  ].join(",");
  const material = [
    params.jobId,
    params.scopeKey,
    String(params.limit),
    String(params.minScore),
    thresholdMaterial,
    params.jobFingerprint,
    params.engineFingerprint,
  ].join("|");
  return buildCacheKey("score", "results", params.jobId, sha256CacheHash(material));
}

export function candidateScoringPopularityKey(jobId: string, scopeKey: string): string {
  return buildCacheKey("score", "pop", jobId, scopeKey);
}

export function candidateScoringJobTagKey(jobId: string): string {
  return buildCacheKey("score", "tag", "job", jobId);
}

export function candidateScoringCandidateTagKey(candidateId: string): string {
  return buildCacheKey("score", "tag", "candidate", candidateId);
}

/** Globs for {@link invalidatePattern} — scoring entries scoped to one job. */
export function candidateScoringJobPatterns(jobId: string): readonly string[] {
  return [
    buildCacheKey("score", "semantic", jobId, "*"),
    buildCacheKey("score", "results", jobId, "*"),
    buildCacheKey("score", "fit", jobId, "*"),
  ];
}

// --- Job → candidate recommendations (GET /api/jobs/[id]/recommended-candidates) ---

export function jobRecommendedCandidatesKey(params: {
  jobId: string;
  scopeKey: string;
  minScore: number;
  jobFingerprint: string;
  engineFingerprint: string;
}): string {
  const material = [
    params.jobId,
    params.scopeKey,
    String(params.minScore),
    params.jobFingerprint,
    params.engineFingerprint,
  ].join("|");
  return buildCacheKey("rec", "job", params.jobId, sha256CacheHash(material));
}

/** Redis SET tag — all recommendation cache keys for one job (invalidation helper). */
export function jobRecommendedCandidatesJobTagKey(jobId: string): string {
  return buildCacheKey("rec", "tag", "job", jobId);
}

/** Redis SET tag — recommendation cache keys that included this candidate in the pool. */
export function jobRecommendedCandidatesCandidateTagKey(candidateId: string): string {
  return buildCacheKey("rec", "tag", "candidate", candidateId);
}

/** Glob for {@link invalidatePattern} — all recommendation entries for a job. */
export function jobRecommendedCandidatesPattern(jobId: string): string {
  return buildCacheKey("rec", "job", jobId, "*");
}

// --- Activity feeds + notifications (short TTL caches) ---

export function globalActivityFeedKey(params: {
  page: number;
  limit: number;
  action?: string | null;
  interviewId?: string | null;
  applicationId?: string | null;
}): string {
  const material = [
    String(params.page),
    String(params.limit),
    normalizeCacheToken(params.action),
    normalizeCacheToken(params.interviewId),
    normalizeCacheToken(params.applicationId),
  ].join("|");
  return buildCacheKey("activity", "feed", sha256CacheHash(material));
}

export function applicationActivityFeedKey(params: {
  applicationId: string;
  page: number;
  limit: number;
}): string {
  const material = [params.applicationId, String(params.page), String(params.limit)].join("|");
  return buildCacheKey("activity", "app", params.applicationId, sha256CacheHash(material));
}

export function dashboardActivityFeedKey(params: {
  role: string | undefined;
  userId: string | undefined;
  limit: number;
}): string {
  const scopeKey = buildRbacScopeKey(params.role, params.userId);
  const material = [scopeKey, String(params.limit)].join("|");
  return buildCacheKey("activity", "dashboard", sha256CacheHash(material));
}

export function notificationsUnreadCountKey(userId: string): string {
  return buildCacheKey("activity", "notif", "unread", normalizeCacheToken(userId));
}

export function notificationsPageKey(params: {
  userId: string;
  page: number;
  limit: number;
}): string {
  const material = [normalizeCacheToken(params.userId), String(params.page), String(params.limit)].join("|");
  return buildCacheKey("activity", "notif", "page", sha256CacheHash(material));
}

/** Redis SET tag — all notification cache keys for a user (invalidation helper). */
export function notificationsUserTagKey(userId: string): string {
  return buildCacheKey("activity", "notif", "tag", normalizeCacheToken(userId));
}

/** @deprecated Use buildRbacScopeKey — alias for existing scoring module exports. */
export const buildCandidateScoringScopeKey = buildRbacScopeKey;
