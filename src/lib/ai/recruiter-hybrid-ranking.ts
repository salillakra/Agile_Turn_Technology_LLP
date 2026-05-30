import {
  computeHybridFinalScore,
  computeLocationScorePercent,
  HYBRID_RECOMMENDATION_WEIGHTS,
} from "@/src/lib/hybrid-recommendation";
import {
  computeJobCandidateExperienceCompatibility,
  type JobCandidateExperienceCompatibility,
} from "@/src/lib/candidate-recommendation-engine";
import type { RecommendationCandidateInput } from "@/src/lib/recommendation-engine";
import {
  parseRecruiterQueryIntent,
  queryIntentToVirtualJob,
  type RecruiterQueryIntent,
} from "@/src/lib/ai/recruiter-query-intent";

export type RecruiterHybridScoreComponents = {
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  locationScore: number;
  finalScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  experience: JobCandidateExperienceCompatibility;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Skill overlap between query-implied required skills and candidate profile.
 * When the query has no skill tokens, returns a neutral score (70).
 */
export function computeQuerySkillScore(
  candidate: RecommendationCandidateInput,
  intent: RecruiterQueryIntent
): { skillScore: number; matchedSkills: string[]; missingSkills: string[] } {
  const required = intent.requiredSkillTokens;
  if (required.length === 0) {
    return { skillScore: 70, matchedSkills: [], missingSkills: [] };
  }

  const candidateSkillSet = new Set(
    (candidate.normalizedSkills ?? []).map((s) => s.toLowerCase())
  );
  const matchedSkills = required.filter((t) => candidateSkillSet.has(t));
  const missingSkills = required.filter((t) => !matchedSkills.includes(t));

  const skillScore = roundScore(
    clampPercent(required.length === 0 ? 70 : (matchedSkills.length / required.length) * 100)
  );

  return {
    skillScore,
    matchedSkills,
    missingSkills,
  };
}

export function computeRecruiterHybridScore(params: {
  candidate: RecommendationCandidateInput;
  intent: RecruiterQueryIntent;
  semanticScore: number;
}): RecruiterHybridScoreComponents {
  const virtualJob = queryIntentToVirtualJob(params.intent);
  const skills = computeQuerySkillScore(params.candidate, params.intent);
  const experience = computeJobCandidateExperienceCompatibility(virtualJob, params.candidate);
  const locationScore = computeLocationScorePercent(params.candidate, virtualJob);

  const semanticScore = roundScore(clampPercent(params.semanticScore));
  const hasSemanticSignal = semanticScore > 0;

  const finalScore = computeHybridFinalScore(
    {
      semanticScore,
      skillScore: skills.skillScore,
      experienceScore: experience.experienceScore,
      locationScore,
    },
    { hasSemanticSignal }
  );

  return {
    semanticScore,
    skillScore: skills.skillScore,
    experienceScore: experience.experienceScore,
    locationScore,
    finalScore,
    matchedSkills: skills.matchedSkills,
    missingSkills: skills.missingSkills,
    experience,
  };
}

export { HYBRID_RECOMMENDATION_WEIGHTS };
