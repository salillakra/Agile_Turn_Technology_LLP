export type CandidateScoringThresholds = {
  /** Minimum score to show as acceptable in ranked lists. */
  minimumAcceptableScore: number;
  /** Above this, treat as high-priority for recruiter review. */
  highPriorityThreshold: number;
  /** Future: above this, UI may offer auto-shortlist suggestion. */
  autoShortlistThreshold: number;
};

const DEFAULT_THRESHOLDS: CandidateScoringThresholds = {
  minimumAcceptableScore: 60,
  highPriorityThreshold: 75,
  autoShortlistThreshold: 90,
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function readNumberEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function readJobMetaNumber(jobMeta: unknown, key: string): number | null {
  if (!jobMeta || typeof jobMeta !== "object" || Array.isArray(jobMeta)) return null;
  const raw = (jobMeta as Record<string, unknown>)[key];
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Resolve thresholds from:
 * 1) jobMeta overrides (per-job control)
 * 2) env vars (system defaults)
 * 3) hardcoded defaults
 */
export function resolveCandidateScoringThresholds(jobMeta?: unknown): CandidateScoringThresholds {
  const min =
    readJobMetaNumber(jobMeta, "aiMinimumAcceptableScore") ??
    readNumberEnv("AI_CANDIDATE_SCORING_MIN_ACCEPTABLE_SCORE") ??
    DEFAULT_THRESHOLDS.minimumAcceptableScore;

  const high =
    readJobMetaNumber(jobMeta, "aiHighPriorityThreshold") ??
    readNumberEnv("AI_CANDIDATE_SCORING_HIGH_PRIORITY_THRESHOLD") ??
    DEFAULT_THRESHOLDS.highPriorityThreshold;

  const auto =
    readJobMetaNumber(jobMeta, "aiAutoShortlistThreshold") ??
    readNumberEnv("AI_CANDIDATE_SCORING_AUTO_SHORTLIST_THRESHOLD") ??
    DEFAULT_THRESHOLDS.autoShortlistThreshold;

  // Enforce ordering and bounds.
  const minimumAcceptableScore = clampPercent(min);
  const highPriorityThreshold = clampPercent(Math.max(high, minimumAcceptableScore));
  const autoShortlistThreshold = clampPercent(Math.max(auto, highPriorityThreshold));

  return {
    minimumAcceptableScore,
    highPriorityThreshold,
    autoShortlistThreshold,
  };
}

