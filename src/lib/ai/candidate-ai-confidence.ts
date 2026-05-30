import { hasStoredEmbedding } from "@/src/lib/candidate-recommendation-engine";
import type { CandidateFitSignalBundle } from "@/src/lib/ai/candidate-scoring-signals";
import type { CandidateResumeQualityInput } from "@/src/lib/ai/candidate-resume-quality";
import { resolveJobSkillLists, resolveJobYearsOfExperience } from "@/src/lib/recommendation-engine";
import type { CandidateScoringJobInput } from "@/src/lib/ai/candidate-scoring-signals";

/** Weights for AI confidence pillars (sum = 1). */
export const AI_CONFIDENCE_WEIGHTS = {
  resumeParsingQuality: 0.35,
  embeddingQuality: 0.35,
  dataCompleteness: 0.3,
} as const;

export type ResumeParseConfidenceStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | string;

export type AiConfidenceInput = {
  job: CandidateScoringJobInput;
  candidate: CandidateResumeQualityInput;
  signals: CandidateFitSignalBundle;
  jobEmbedding?: unknown | null;
  candidateEmbedding?: unknown | null;
  /** Latest `ResumeParseJob.status` when known. */
  resumeParseStatus?: ResumeParseConfidenceStatus | null;
};

export type AiConfidenceFactor = {
  id: keyof typeof AI_CONFIDENCE_WEIGHTS;
  label: string;
  score: number;
  weight: number;
  contribution: number;
};

export type AiConfidenceResult = {
  /** Overall AI confidence in [0, 1]. */
  confidenceScore: number;
  resumeParsingQuality: number;
  embeddingQuality: number;
  dataCompleteness: number;
  factors: AiConfidenceFactor[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function candidateHasStructuredParseProfile(candidate: CandidateResumeQualityInput): boolean {
  const skills =
    (candidate.normalizedSkills?.length ?? 0) > 0 || (candidate.skills?.length ?? 0) > 0;
  const employers = (candidate.companies?.length ?? 0) > 0;
  const education = candidate.education != null;
  return hasText(candidate.summary) || skills || employers || education;
}

/**
 * Confidence in résumé parse / structured profile quality [0, 1].
 */
export function scoreResumeParsingQuality(input: AiConfidenceInput): number {
  const profileScore = input.signals.resumeQuality.resumeQualityScore / 100;
  const status = input.resumeParseStatus?.toString().toUpperCase() ?? null;
  const structured = candidateHasStructuredParseProfile(input.candidate);

  if (status === "COMPLETED") {
    if (structured && profileScore >= 0.55) return round4(1);
    if (structured) return round4(0.85);
    return round4(Math.max(0.6, profileScore));
  }

  if (status === "PROCESSING" || status === "PENDING") {
    return round4(Math.max(0.35, profileScore * 0.65));
  }

  if (status === "FAILED") {
    return round4(Math.min(0.25, profileScore * 0.4));
  }

  return round4(clamp01(profileScore));
}

/**
 * Confidence in embedding coverage for semantic scoring [0, 1].
 */
export function scoreEmbeddingQuality(input: AiConfidenceInput): number {
  const hasJob = hasStoredEmbedding(input.jobEmbedding ?? null);
  const hasCandidate = hasStoredEmbedding(input.candidateEmbedding ?? null);
  const { semantic } = input.signals;

  if (!hasJob && !hasCandidate) {
    return 0.1;
  }

  if (!hasJob || !hasCandidate) {
    return round4(0.4);
  }

  if (semantic.semanticAvailable && semantic.source === "pgvector") {
    return 1;
  }

  if (semantic.semanticAvailable && semantic.source === "in_memory") {
    return round4(0.88);
  }

  return round4(0.55);
}

/**
 * Confidence that required scoring fields are populated [0, 1].
 */
export function scoreDataCompleteness(input: AiConfidenceInput): number {
  const { job, candidate, signals } = input;
  const { requiredRaw } = resolveJobSkillLists(job);
  const jobYears = resolveJobYearsOfExperience(job);

  let earned = 0;
  let possible = 0;

  const add = (weight: number, fraction: number) => {
    possible += weight;
    earned += weight * clamp01(fraction);
  };

  add(0.35, signals.resumeQuality.resumeQualityScore / 100);

  const skillFraction =
    requiredRaw.length === 0
      ? 1
      : (candidate.normalizedSkills?.length ?? 0) > 0 || (candidate.skills?.length ?? 0) > 0
        ? 1
        : 0;
  add(0.25, skillFraction);

  const expFraction =
    jobYears == null || jobYears <= 0
      ? 1
      : candidate.totalExperience != null && Number.isFinite(candidate.totalExperience)
        ? 1
        : 0;
  add(0.2, expFraction);

  const hasCandidateLoc = Boolean(candidate.preferredWorkLocation?.trim());
  const hasJobLoc = Boolean(job.location?.trim());
  const locFraction = !hasJobLoc ? 1 : hasCandidateLoc ? 1 : 0.5;
  add(0.1, locFraction);

  add(0.1, hasStoredEmbedding(input.candidateEmbedding ?? null) ? 1 : 0);

  if (possible <= 0) return 0;
  return round4(clamp01(earned / possible));
}

/**
 * AI confidence that `candidateFitScore` is well-supported by underlying data.
 */
export function computeAiConfidenceScore(input: AiConfidenceInput): AiConfidenceResult {
  const resumeParsingQuality = scoreResumeParsingQuality(input);
  const embeddingQuality = scoreEmbeddingQuality(input);
  const dataCompleteness = scoreDataCompleteness(input);

  const w = AI_CONFIDENCE_WEIGHTS;
  const factors: AiConfidenceFactor[] = [
    {
      id: "resumeParsingQuality",
      label: "Resume parsing quality",
      score: resumeParsingQuality,
      weight: w.resumeParsingQuality,
      contribution: round4(w.resumeParsingQuality * resumeParsingQuality),
    },
    {
      id: "embeddingQuality",
      label: "Embedding quality",
      score: embeddingQuality,
      weight: w.embeddingQuality,
      contribution: round4(w.embeddingQuality * embeddingQuality),
    },
    {
      id: "dataCompleteness",
      label: "Data completeness",
      score: dataCompleteness,
      weight: w.dataCompleteness,
      contribution: round4(w.dataCompleteness * dataCompleteness),
    },
  ];

  const confidenceScore = round4(
    clamp01(factors.reduce((sum, f) => sum + f.contribution, 0))
  );

  return {
    confidenceScore,
    resumeParsingQuality,
    embeddingQuality,
    dataCompleteness,
    factors,
  };
}
