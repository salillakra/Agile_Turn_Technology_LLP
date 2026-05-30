import {
  matchJobSkills,
  resolveJobSkillLists,
  scoreExperienceMatch,
  scoreLocationMatch,
  type RecommendationCandidateInput,
  type RecommendationJobInput,
} from "@/src/lib/recommendation-engine";
import { scoreJobSemanticSimilarity } from "@/src/lib/semantic-recommendation";
import { extractEmbeddingVector } from "@/src/lib/vector-similarity";
import {
  buildAiRecommendationHeadline,
  buildExperienceMatchText,
  buildHybridRecommendationReason,
  resolveSkillExplainability,
} from "@/src/lib/recommendation-explainability";

/** Hybrid blend: 50% semantic + 30% skill + 15% experience + 5% location. */
export const HYBRID_RECOMMENDATION_WEIGHTS = {
  semantic: 0.5,
  skill: 0.3,
  experience: 0.15,
  location: 0.05,
} as const;

export type HybridJobRecommendation = {
  jobId: string;
  title: string;
  finalScore: number;
  semanticScore: number;
  skillScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  recommendationReason: string;
  aiRecommendationReason: string;
  /** @deprecated Use recommendationReason — kept for internal composition */
  semanticReason?: string;
  experienceMatch?: string;
};

export type HybridRecommendationJobInput = RecommendationJobInput & {
  embedding?: unknown | null;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Required-skill overlap on 0–100 (preferred skills add a small capped bonus). */
export function computeSkillScorePercent(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): number {
  const { requiredRaw, preferredRaw } = resolveJobSkillLists(job);
  const skillMatch = matchJobSkills(candidate, requiredRaw, preferredRaw);
  const preferredBoost = skillMatch.preferredSkillsBonus * 0.5;
  return roundScore(clampPercent(skillMatch.requiredSkillsMatchPercent + preferredBoost));
}

/** Experience fit on 0–100 for hybrid weighting. */
export function computeExperienceScorePercent(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): number {
  const exp = scoreExperienceMatch(candidate, job);

  if (exp.jobYearsOfExperience == null || exp.jobYearsOfExperience <= 0) {
    return 100;
  }

  if (exp.candidateTotalExperience == null) {
    return 0;
  }

  if (exp.exceedsSignificantly) {
    return 100;
  }

  if (exp.meetsMinimum) {
    return 85;
  }

  const ratio = exp.candidateTotalExperience / exp.jobYearsOfExperience;
  return roundScore(clampPercent(ratio * 60));
}

/** Location fit on 0–100 for hybrid weighting. */
export function computeLocationScorePercent(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): number {
  const location = scoreLocationMatch(candidate, job);

  if (!location.candidatePreferredLocation && !location.jobLocation) {
    return 50;
  }

  if (!location.candidatePreferredLocation || !location.jobLocation) {
    return 50;
  }

  return location.locationMatched ? 100 : 0;
}

/**
 * finalScore =
 *   50% semanticScore +
 *   30% skillScore +
 *   15% experienceScore +
 *   5% locationScore
 */
/** Weights when semantic embeddings are unavailable (renormalized from skill + experience + location). */
export const HYBRID_WEIGHTS_WITHOUT_SEMANTIC = {
  skill: 0.6,
  experience: 0.3,
  location: 0.1,
} as const;

export function computeHybridFinalScore(
  components: {
    semanticScore: number;
    skillScore: number;
    experienceScore: number;
    locationScore: number;
  },
  options?: { hasSemanticSignal?: boolean }
): number {
  const hasSemantic = options?.hasSemanticSignal !== false;

  if (hasSemantic) {
    const { semantic, skill, experience, location } = HYBRID_RECOMMENDATION_WEIGHTS;
    const raw =
      semantic * components.semanticScore +
      skill * components.skillScore +
      experience * components.experienceScore +
      location * components.locationScore;
    return roundScore(clampPercent(raw));
  }

  const { skill, experience, location } = HYBRID_WEIGHTS_WITHOUT_SEMANTIC;
  const raw =
    skill * components.skillScore +
    experience * components.experienceScore +
    location * components.locationScore;

  return roundScore(clampPercent(raw));
}

export function scoreHybridJob(
  candidate: RecommendationCandidateInput,
  candidateEmbedding: unknown,
  job: HybridRecommendationJobInput
): HybridJobRecommendation {
  const semanticRaw = scoreJobSemanticSimilarity(candidateEmbedding, job.embedding ?? null);
  const semanticScore = semanticRaw ?? 0;
  const hasSemanticSignal =
    semanticRaw != null &&
    extractEmbeddingVector(candidateEmbedding) != null &&
    extractEmbeddingVector(job.embedding ?? null) != null;
  const skillExplain = resolveSkillExplainability(candidate, job);
  const skillScore = computeSkillScorePercent(candidate, job);
  const experienceScore = computeExperienceScorePercent(candidate, job);
  const locationScore = computeLocationScorePercent(candidate, job);

  const finalScore = computeHybridFinalScore(
    {
      semanticScore,
      skillScore,
      experienceScore,
      locationScore,
    },
    { hasSemanticSignal }
  );

  const experienceMatch = buildExperienceMatchText(candidate, job);
  const recommendationReason = buildHybridRecommendationReason({
    jobTitle: job.title,
    semanticScore: roundScore(semanticScore),
    skillScore,
    matchedSkills: skillExplain.matchedSkills,
    matchedPreferredSkills: skillExplain.matchedPreferredSkills,
    missingSkills: skillExplain.missingSkills,
    hasEmbeddings: hasSemanticSignal,
    experienceMatch,
  });
  const aiRecommendationReason = buildAiRecommendationHeadline({
    jobTitle: job.title,
    semanticScore: roundScore(semanticScore),
    skillScore,
    matchedSkills: skillExplain.matchedSkills,
  });

  return {
    jobId: job.id,
    title: job.title,
    finalScore,
    semanticScore: roundScore(semanticScore),
    skillScore,
    matchedSkills: skillExplain.matchedSkills,
    missingSkills: skillExplain.missingSkills,
    recommendationReason,
    aiRecommendationReason,
    experienceMatch,
  };
}

export function compareHybridRecommendations(
  a: HybridJobRecommendation,
  b: HybridJobRecommendation
): number {
  if (b.finalScore !== a.finalScore) {
    return b.finalScore - a.finalScore;
  }
  if (b.semanticScore !== a.semanticScore) {
    return b.semanticScore - a.semanticScore;
  }
  if (b.skillScore !== a.skillScore) {
    return b.skillScore - a.skillScore;
  }
  return a.jobId.localeCompare(b.jobId);
}

/** Rank open jobs by hybrid score (semantic + rules), best first. */
export function recommendJobsHybrid(
  candidate: RecommendationCandidateInput,
  candidateEmbedding: unknown,
  jobs: readonly HybridRecommendationJobInput[]
): HybridJobRecommendation[] {
  const scored = (jobs ?? []).map((job) => scoreHybridJob(candidate, candidateEmbedding, job));
  scored.sort(compareHybridRecommendations);
  return scored;
}

export function filterHybridRecommendationsByThreshold(
  rows: readonly HybridJobRecommendation[],
  minFinalScore: number
): HybridJobRecommendation[] {
  if (!Number.isFinite(minFinalScore)) return [...rows];
  return rows.filter((row) => row.finalScore >= minFinalScore);
}
