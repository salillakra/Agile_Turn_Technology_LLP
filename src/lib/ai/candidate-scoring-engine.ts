/**
 * Job↔candidate hybrid fit scoring.
 *
 * candidateFitScore =
 *   30% semantic + 35% skill + 15% experience + 10% skill recency +
 *   5% resume quality + 3% certifications + 2% location
 */

import {
  buildCandidateFitScoreBreakdown,
  type CandidateFitScoreBreakdown,
} from "@/src/lib/ai/candidate-scoring-breakdown";
import { computeCandidateFitConfidenceDetailed } from "@/src/lib/ai/candidate-scoring-confidence";
import {
  buildCandidateRecommendationReasons,
  buildPrimaryRecommendationReason,
} from "@/src/lib/ai/candidate-recommendation-reasons";
import {
  collectCandidateFitSignals,
  collectCandidateFitSignalsAsync,
  type CandidateScoringJobInput,
} from "@/src/lib/ai/candidate-scoring-signals";
import {
  computeCandidateFitScore,
  HYBRID_CANDIDATE_FIT_WEIGHTS,
  type HybridCandidateFitScoreResult,
} from "@/src/lib/ai/candidate-scoring-weights";
import type { AiConfidenceResult } from "@/src/lib/ai/candidate-ai-confidence";
import type { CandidateResumeQualityInput } from "@/src/lib/ai/candidate-resume-quality";

export type { CandidateFitScoreBreakdown, CandidateFitScoreFactor } from "@/src/lib/ai/candidate-scoring-breakdown";
export type { CandidateFitSignalBundle } from "@/src/lib/ai/candidate-scoring-signals";
export {
  HYBRID_CANDIDATE_FIT_WEIGHTS,
  HYBRID_CANDIDATE_FIT_WEIGHTS_WITHOUT_SEMANTIC,
  computeCandidateFitScore,
  computeSemanticWeightedContribution,
} from "@/src/lib/ai/candidate-scoring-weights";
export type { CandidateSemanticSignal } from "@/src/lib/ai/candidate-scoring-semantic";
export {
  computeCandidateSkillOverlap,
  type CandidateSkillOverlapResult,
} from "@/src/lib/ai/candidate-skill-overlap";
export {
  computeCandidateExperienceCompatibility,
  type CandidateExperienceCompatibilityResult,
} from "@/src/lib/ai/candidate-experience-compatibility";
export {
  computeResumeQualityScore,
  type CandidateResumeQualityResult,
} from "@/src/lib/ai/candidate-resume-quality";
export {
  computeCandidateCertificationRelevance,
  type CandidateCertificationRelevanceResult,
} from "@/src/lib/ai/candidate-certification-relevance";
export {
  computeCandidateSkillRecency,
  type CandidateSkillRecencyResult,
} from "@/src/lib/ai/candidate-skill-recency";
export {
  buildCandidateRecommendationReasons,
  buildPrimaryRecommendationReason,
} from "@/src/lib/ai/candidate-recommendation-reasons";
export type { CandidateResumeQualityInput };
export type { AiConfidenceResult } from "@/src/lib/ai/candidate-ai-confidence";
export {
  AI_CONFIDENCE_WEIGHTS,
  computeAiConfidenceScore,
} from "@/src/lib/ai/candidate-ai-confidence";

export type CandidateFitScoringInput = {
  job: CandidateScoringJobInput;
  candidate: CandidateResumeQualityInput;
  jobEmbedding?: unknown | null;
  candidateEmbedding?: unknown | null;
  pgvectorCosineSimilarity?: number | null;
  resumeCompletenessScore?: number | null;
  /** `ResumeParseJob.status` for parse-quality confidence. */
  resumeParseStatus?: string | null;
};

/** Primary API output — headline scores plus explainable breakdown. */
export type CandidateFitScoreResult = {
  /** Final hybrid score (0–100). */
  candidateFitScore: number;
  /** @deprecated Alias for {@link candidateFitScore}. */
  finalScore: number;
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  skillRecencyScore: number;
  resumeQualityScore: number;
  certificationRelevanceScore: number;
  locationScore: number;
  /** @deprecated Certifications are blended at 3%; always 0. */
  certificationBonus: number;
  /** @deprecated Use {@link candidateFitScore}. */
  baseFinalScore: number;
  matchedRelevantCertifications: string[];
  /** AI confidence in underlying data quality [0, 1]. */
  confidenceScore: number;
  aiConfidence: AiConfidenceResult;
  /** Explainability bullets for recruiters (template-based). */
  recommendationReasons: string[];
  /** @deprecated Primary line; use {@link recommendationReasons}. */
  recommendationReason: string;
  hybrid: HybridCandidateFitScoreResult;
  breakdown: CandidateFitScoreBreakdown;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreFromSignals(
  input: CandidateFitScoringInput,
  signals: Awaited<ReturnType<typeof collectCandidateFitSignalsAsync>>
): CandidateFitScoreResult {
  const semanticScore = roundScore(signals.semantic.semanticScore);
  const skillScore = roundScore(signals.skills.skillScore);
  const experienceScore = roundScore(signals.experience.experienceScore);
  const skillRecencyScore = roundScore(signals.skillRecency.skillRecencyScore);
  const resumeQualityScore = roundScore(signals.resumeQuality.resumeQualityScore);
  const certificationRelevanceScore = roundScore(
    signals.certificationRelevance.certificationRelevanceScore
  );
  const locationScore = roundScore(signals.locationScore);

  const hybrid = computeCandidateFitScore(
    {
      semanticScore,
      skillScore,
      experienceScore,
      skillRecencyScore,
      resumeQualityScore,
      certificationScore: certificationRelevanceScore,
      locationScore,
    },
    { hasSemanticSignal: signals.semanticAvailable }
  );

  const candidateFitScore = hybrid.candidateFitScore;

  const aiConfidence = computeCandidateFitConfidenceDetailed({
    job: input.job,
    candidate: input.candidate,
    signals,
    jobEmbedding: input.jobEmbedding,
    candidateEmbedding: input.candidateEmbedding,
    resumeParseStatus: input.resumeParseStatus,
    resumeCompletenessScore:
      input.resumeCompletenessScore ?? signals.resumeQuality.resumeQualityScore,
  });

  const confidenceScore = aiConfidence.confidenceScore;

  const reasonInput = {
    job: input.job,
    candidate: input.candidate,
    signals,
    semanticScore,
    skillScore,
    experienceScore,
    skillRecencyScore,
  };
  const recommendationReasons = buildCandidateRecommendationReasons(reasonInput);
  const recommendationReason = buildPrimaryRecommendationReason(reasonInput);

  const breakdown = buildCandidateFitScoreBreakdown({
    job: input.job,
    candidate: input.candidate,
    signals,
    candidateFitScore,
    contributions: hybrid.contributions,
    weightsProfile: hybrid.weightsProfile,
    semanticScore,
    skillScore,
    experienceScore,
    skillRecencyScore,
    aiConfidence,
    recommendationReasons,
  });

  return {
    candidateFitScore,
    finalScore: candidateFitScore,
    baseFinalScore: candidateFitScore,
    semanticScore,
    skillScore,
    experienceScore,
    skillRecencyScore,
    resumeQualityScore,
    certificationRelevanceScore,
    locationScore,
    certificationBonus: 0,
    matchedRelevantCertifications: [...signals.certificationRelevance.matchedCertifications],
    confidenceScore,
    aiConfidence,
    recommendationReasons,
    recommendationReason,
    hybrid,
    breakdown,
  };
}

export function scoreCandidateFit(input: CandidateFitScoringInput): CandidateFitScoreResult {
  const signals = collectCandidateFitSignals({
    job: input.job,
    candidate: input.candidate,
    jobEmbedding: input.jobEmbedding,
    candidateEmbedding: input.candidateEmbedding,
    pgvectorCosineSimilarity: input.pgvectorCosineSimilarity,
  });

  return scoreFromSignals(input, signals);
}

export async function scoreCandidateFitAsync(
  input: CandidateFitScoringInput
): Promise<CandidateFitScoreResult> {
  const signals = await collectCandidateFitSignalsAsync({
    job: input.job,
    candidate: input.candidate,
    jobEmbedding: input.jobEmbedding,
    candidateEmbedding: input.candidateEmbedding,
    pgvectorCosineSimilarity: input.pgvectorCosineSimilarity,
  });

  return scoreFromSignals(input, signals);
}

export async function rankCandidatesByFitScoreAsync<T extends CandidateResumeQualityInput>(
  job: CandidateScoringJobInput,
  jobEmbedding: unknown,
  candidates: readonly (T & { embedding?: unknown | null })[],
  options?: { resumeCompletenessByCandidateId?: ReadonlyMap<string, number> }
): Promise<Array<CandidateFitScoreResult & { candidate: T }>> {
  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      const resumeCompletenessScore =
        candidate.id != null && options?.resumeCompletenessByCandidateId
          ? options.resumeCompletenessByCandidateId.get(candidate.id)
          : undefined;

      const result = await scoreCandidateFitAsync({
        job,
        candidate,
        jobEmbedding,
        candidateEmbedding: candidate.embedding,
        resumeCompletenessScore,
      });

      return { ...result, candidate };
    })
  );

  scored.sort((a, b) => {
    if (b.candidateFitScore !== a.candidateFitScore) {
      return b.candidateFitScore - a.candidateFitScore;
    }
    if (b.semanticScore !== a.semanticScore) return b.semanticScore - a.semanticScore;
    if (b.skillScore !== a.skillScore) return b.skillScore - a.skillScore;
    const aId = a.candidate.id ?? "";
    const bId = b.candidate.id ?? "";
    return aId.localeCompare(bId);
  });

  return scored;
}

export function rankCandidatesByFitScore<T extends CandidateResumeQualityInput>(
  job: CandidateScoringJobInput,
  jobEmbedding: unknown,
  candidates: readonly (T & { embedding?: unknown | null })[],
  options?: { resumeCompletenessByCandidateId?: ReadonlyMap<string, number> }
): Array<CandidateFitScoreResult & { candidate: T }> {
  const scored = candidates.map((candidate) => {
    const resumeCompletenessScore =
      candidate.id != null && options?.resumeCompletenessByCandidateId
        ? options.resumeCompletenessByCandidateId.get(candidate.id)
        : undefined;

    const result = scoreCandidateFit({
      job,
      candidate,
      jobEmbedding,
      candidateEmbedding: candidate.embedding,
      resumeCompletenessScore,
    });

    return { ...result, candidate };
  });

  scored.sort((a, b) => {
    if (b.candidateFitScore !== a.candidateFitScore) {
      return b.candidateFitScore - a.candidateFitScore;
    }
    if (b.semanticScore !== a.semanticScore) return b.semanticScore - a.semanticScore;
    if (b.skillScore !== a.skillScore) return b.skillScore - a.skillScore;
    const aId = a.candidate.id ?? "";
    const bId = b.candidate.id ?? "";
    return aId.localeCompare(bId);
  });

  return scored;
}
