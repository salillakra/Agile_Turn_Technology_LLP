/**
 * Recommendation threshold configuration.
 *
 * - **Job recommendations** (candidate → jobs): `RECOMMENDATION_THRESHOLD_CONFIG`
 * - **Candidate recommendations** (job → candidates): `CANDIDATE_RECOMMENDATION_THRESHOLD_CONFIG`
 *
 * Future: replace env defaults with admin settings / DB-backed config without changing API contracts.
 */

export const RECOMMENDATION_THRESHOLD_CONFIG = {
  /** Jobs with `finalScore` below this value are excluded from forward recommendation APIs. */
  defaultMinMatchScorePercent: 40,
  minAllowedPercent: 0,
  maxAllowedPercent: 100,
} as const;

/** Reverse recommendations: ranked candidates for a job (`GET /api/jobs/[id]/recommended-candidates`, etc.). */
export const CANDIDATE_RECOMMENDATION_THRESHOLD_CONFIG = {
  /** Candidates with `finalScore` below this value are omitted from results. */
  defaultMinFinalScorePercent: 45,
  minAllowedPercent: 0,
  maxAllowedPercent: 100,
} as const;

function clampThresholdPercent(
  value: number,
  bounds: { minAllowedPercent: number; maxAllowedPercent: number }
): number {
  return Math.max(
    bounds.minAllowedPercent,
    Math.min(bounds.maxAllowedPercent, Math.round(value))
  );
}

/**
 * Default minimum match % — from `RECOMMENDATION_MIN_MATCH_SCORE` env when valid,
 * otherwise `RECOMMENDATION_THRESHOLD_CONFIG.defaultMinMatchScorePercent` (40).
 */
export function getDefaultMinMatchScorePercent(): number {
  const raw = process.env.RECOMMENDATION_MIN_MATCH_SCORE?.trim();
  if (raw) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) {
      return clampThresholdPercent(n, RECOMMENDATION_THRESHOLD_CONFIG);
    }
  }
  return RECOMMENDATION_THRESHOLD_CONFIG.defaultMinMatchScorePercent;
}

/**
 * Default minimum `finalScore` for job→candidate APIs — env `CANDIDATE_RECOMMENDATION_MIN_SCORE`, else 45%.
 */
export function getDefaultCandidateRecommendationMinScorePercent(): number {
  const raw = process.env.CANDIDATE_RECOMMENDATION_MIN_SCORE?.trim();
  if (raw) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) {
      return clampThresholdPercent(n, CANDIDATE_RECOMMENDATION_THRESHOLD_CONFIG);
    }
  }
  return CANDIDATE_RECOMMENDATION_THRESHOLD_CONFIG.defaultMinFinalScorePercent;
}

/**
 * Resolve threshold for a request: query `minScore` overrides config default.
 */
export function resolveMinMatchScorePercent(
  minScoreQuery: string | null | undefined
): number {
  const raw = minScoreQuery?.trim();
  if (!raw) {
    return getDefaultMinMatchScorePercent();
  }
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) {
    return getDefaultMinMatchScorePercent();
  }
  return clampThresholdPercent(n, RECOMMENDATION_THRESHOLD_CONFIG);
}

/**
 * Resolve candidate-recommendation threshold: query `minScore` overrides config default.
 */
export function resolveCandidateRecommendationMinScorePercent(
  minScoreQuery: string | null | undefined
): number {
  const raw = minScoreQuery?.trim();
  if (!raw) {
    return getDefaultCandidateRecommendationMinScorePercent();
  }
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) {
    return getDefaultCandidateRecommendationMinScorePercent();
  }
  return clampThresholdPercent(n, CANDIDATE_RECOMMENDATION_THRESHOLD_CONFIG);
}

/**
 * Threshold for job→candidate APIs: explicit `minScore` query wins; else job
 * `resumeMatchThreshold` (same as apply eligibility); else global default (45%).
 */
/** `jobMeta.resumeMatchThreshold` when set (apply-flow parity). */
export function readJobResumeMatchThresholdPercent(jobMeta: unknown): number | null {
  const obj =
    jobMeta != null && typeof jobMeta === "object" && !Array.isArray(jobMeta)
      ? (jobMeta as Record<string, unknown>)
      : null;
  const raw = obj?.resumeMatchThreshold;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n)
    ? clampThresholdPercent(n, CANDIDATE_RECOMMENDATION_THRESHOLD_CONFIG)
    : null;
}

export function resolveCandidateRecommendationMinScoreForJob(
  minScoreQuery: string | null | undefined,
  jobResumeMatchThreshold: number | null | undefined
): number {
  const raw = minScoreQuery?.trim();
  if (raw) {
    return resolveCandidateRecommendationMinScorePercent(raw);
  }
  if (
    jobResumeMatchThreshold != null &&
    Number.isFinite(jobResumeMatchThreshold)
  ) {
    return clampThresholdPercent(
      jobResumeMatchThreshold,
      CANDIDATE_RECOMMENDATION_THRESHOLD_CONFIG
    );
  }
  return getDefaultCandidateRecommendationMinScorePercent();
}

/** True when a job should be included in forward recommendation results. */
export function passesRecommendationThreshold(
  matchScore: number,
  minScorePercent: number = getDefaultMinMatchScorePercent()
): boolean {
  if (!Number.isFinite(matchScore)) return false;
  return matchScore >= minScorePercent;
}

/**
 * Drop jobs below the minimum score (rule 1: ignore weak matches).
 */
export function filterRecommendationsByThreshold<T extends { matchScore: number }>(
  rows: readonly T[],
  minScorePercent?: number
): T[] {
  const threshold = minScorePercent ?? getDefaultMinMatchScorePercent();
  return rows.filter((row) => passesRecommendationThreshold(row.matchScore, threshold));
}

/** True when a candidate row should be included in job→candidate recommendation results. */
export function passesCandidateRecommendationThreshold(
  finalScore: number,
  minScorePercent: number = getDefaultCandidateRecommendationMinScorePercent()
): boolean {
  if (!Number.isFinite(finalScore)) return false;
  return finalScore >= minScorePercent;
}

/**
 * Drop candidates below the minimum hybrid `finalScore` (rule: ignore low-quality matches).
 */
export function filterCandidateRecommendationsByThreshold<T extends { finalScore: number }>(
  rows: readonly T[],
  minScorePercent?: number
): T[] {
  const threshold = minScorePercent ?? getDefaultCandidateRecommendationMinScorePercent();
  return rows.filter((row) =>
    passesCandidateRecommendationThreshold(row.finalScore, threshold)
  );
}
