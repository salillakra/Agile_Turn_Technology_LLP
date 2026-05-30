import {
  computeCandidateExperienceCompatibility,
  type CandidateExperienceCompatibilityResult,
} from "@/src/lib/ai/candidate-experience-compatibility";
import {
  computeResumeQualityScore,
  type CandidateResumeQualityInput,
  type CandidateResumeQualityResult,
} from "@/src/lib/ai/candidate-resume-quality";
import {
  computeCandidateCertificationRelevance,
  type CandidateCertificationRelevanceResult,
} from "@/src/lib/ai/candidate-certification-relevance";
import {
  computeCandidateSkillRecency,
  type CandidateSkillRecencyResult,
} from "@/src/lib/ai/candidate-skill-recency";
import {
  computeCandidateSkillOverlap,
  type CandidateSkillOverlapResult,
} from "@/src/lib/ai/candidate-skill-overlap";
import {
  normalizePgvectorCosineSimilarity,
  resolveCandidateSemanticFromEmbeddings,
  resolveCandidateSemanticSignal,
  semanticScoreFromNormalizedCosine,
  type CandidateSemanticSignal,
} from "@/src/lib/ai/candidate-scoring-semantic";
import {
  computeLocationScorePercent,
  type HybridRecommendationJobInput,
} from "@/src/lib/hybrid-recommendation";
import type { RecommendationCandidateInput } from "@/src/lib/recommendation-engine";

export type CandidateScoringJobInput = HybridRecommendationJobInput;

export type CandidateFitSignalBundle = {
  semantic: CandidateSemanticSignal;
  skills: CandidateSkillOverlapResult;
  experience: CandidateExperienceCompatibilityResult;
  resumeQuality: CandidateResumeQualityResult;
  certificationRelevance: CandidateCertificationRelevanceResult;
  skillRecency: CandidateSkillRecencyResult;
  locationScore: number;
  semanticAvailable: boolean;
};

export type { CandidateResumeQualityInput, CandidateResumeQualityResult };

function buildSignalBundle(params: {
  job: CandidateScoringJobInput;
  candidate: CandidateResumeQualityInput;
  semantic: CandidateSemanticSignal;
}): CandidateFitSignalBundle {
  const skills = computeCandidateSkillOverlap(params.job, params.candidate);
  const experience = computeCandidateExperienceCompatibility(params.job, params.candidate);
  const resumeQuality = computeResumeQualityScore(params.candidate);
  const certificationRelevance = computeCandidateCertificationRelevance(
    params.job,
    params.candidate
  );
  const skillRecency = computeCandidateSkillRecency(
    params.candidate,
    skills.matchedSkills
  );
  const locationScore = computeLocationScorePercent(params.candidate, params.job);

  return {
    semantic: params.semantic,
    skills,
    experience,
    resumeQuality,
    certificationRelevance,
    skillRecency,
    locationScore,
    semanticAvailable: params.semantic.semanticAvailable,
  };
}

/**
 * Synchronous signal collection — semantic from in-memory JSON embeddings only.
 * For pgvector similarity, use {@link collectCandidateFitSignalsAsync}.
 */
export function collectCandidateFitSignals(params: {
  job: CandidateScoringJobInput;
  candidate: CandidateResumeQualityInput;
  jobEmbedding?: unknown | null;
  candidateEmbedding?: unknown | null;
  /** Pre-normalized pgvector cosine [0, 1] when already fetched. */
  pgvectorCosineSimilarity?: number | null;
}): CandidateFitSignalBundle {
  const normalized = normalizePgvectorCosineSimilarity(params.pgvectorCosineSimilarity);
  const semantic: CandidateSemanticSignal =
    normalized != null
      ? {
          cosineSimilarity: normalized,
          semanticScore: semanticScoreFromNormalizedCosine(normalized),
          semanticAvailable: true,
          source: "pgvector",
          hasJobEmbedding: true,
          hasCandidateEmbedding: true,
        }
      : resolveCandidateSemanticFromEmbeddings(
          params.jobEmbedding ?? null,
          params.candidateEmbedding ?? null
        );

  return buildSignalBundle({ ...params, semantic });
}

/**
 * Collects job↔candidate scoring signals; semantic similarity prefers pgvector `<=>` scores.
 */
export async function collectCandidateFitSignalsAsync(params: {
  job: CandidateScoringJobInput;
  candidate: CandidateResumeQualityInput;
  jobEmbedding?: unknown | null;
  candidateEmbedding?: unknown | null;
  pgvectorCosineSimilarity?: number | null;
}): Promise<CandidateFitSignalBundle> {
  const semantic = await resolveCandidateSemanticSignal({
    jobId: params.job.id,
    candidateId: params.candidate.id,
    jobEmbedding: params.jobEmbedding,
    candidateEmbedding: params.candidateEmbedding,
    pgvectorCosineSimilarity: params.pgvectorCosineSimilarity,
  });

  return buildSignalBundle({ ...params, semantic });
}
