import {
  computeAiConfidenceScore,
  type AiConfidenceInput,
  type AiConfidenceResult,
} from "@/src/lib/ai/candidate-ai-confidence";
import type { CandidateFitSignalBundle } from "@/src/lib/ai/candidate-scoring-signals";
import type { CandidateResumeQualityInput } from "@/src/lib/ai/candidate-resume-quality";
import type { RecommendationCandidateInput } from "@/src/lib/recommendation-engine";
import type { CandidateScoringJobInput } from "@/src/lib/ai/candidate-scoring-signals";

export type { AiConfidenceResult, AiConfidenceFactor } from "@/src/lib/ai/candidate-ai-confidence";
export {
  AI_CONFIDENCE_WEIGHTS,
  computeAiConfidenceScore,
  scoreDataCompleteness,
  scoreEmbeddingQuality,
  scoreResumeParsingQuality,
} from "@/src/lib/ai/candidate-ai-confidence";

export type CandidateFitConfidenceInput = {
  job: CandidateScoringJobInput;
  candidate: RecommendationCandidateInput;
  signals: CandidateFitSignalBundle;
  jobEmbedding?: unknown | null;
  candidateEmbedding?: unknown | null;
  resumeParseStatus?: string | null;
  /** @deprecated Use signals.resumeQuality; kept for call-site compat. */
  resumeCompletenessScore?: number | null;
};

/**
 * AI confidence in [0, 1] — does not change `candidateFitScore`.
 */
export function computeCandidateFitConfidence(
  input: CandidateFitConfidenceInput
): number {
  return computeCandidateFitConfidenceDetailed(input).confidenceScore;
}

export function computeCandidateFitConfidenceDetailed(
  input: CandidateFitConfidenceInput
): AiConfidenceResult {
  const aiInput: AiConfidenceInput = {
    job: input.job,
    candidate: input.candidate as CandidateResumeQualityInput,
    signals: input.signals,
    jobEmbedding: input.jobEmbedding,
    candidateEmbedding: input.candidateEmbedding,
    resumeParseStatus: input.resumeParseStatus,
  };

  return computeAiConfidenceScore(aiInput);
}
