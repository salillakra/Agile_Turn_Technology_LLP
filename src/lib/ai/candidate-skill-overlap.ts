import {
  matchJobSkills,
  resolveJobSkillLists,
  type RecommendationCandidateInput,
  type RecommendationJobInput,
} from "@/src/lib/recommendation-engine";
import { normalizeSkills } from "@/src/lib/skill-normalizer";

/** Max points added to `skillScore` from preferred-skill overlap (on 0–100 scale). */
export const CANDIDATE_SKILL_PREFERRED_BONUS_MAX = 10;

export type CandidateSkillOverlapResult = {
  /** Job required labels matched in `candidate.normalizedSkills`. */
  matchedSkills: string[];
  /** Required job skills with no candidate match. */
  missingSkills: string[];
  /** Preferred job labels matched (bonus signal). */
  matchedPreferredSkills: string[];
  /** `(matched required / total required) × 100`, or 100 when job has no required skills. */
  requiredMatchPercent: number;
  /** Preferred overlap as percent of job preferred list (0–100). */
  preferredMatchPercent: number;
  /** Points added to `skillScore` from preferred overlap (0–{@link CANDIDATE_SKILL_PREFERRED_BONUS_MAX}). */
  preferredSkillsBonus: number;
  /** Combined required coverage + preferred bonus, clamped 0–100. */
  skillScore: number;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Canonical skill set for overlap — prefers `candidate.normalizedSkills`.
 * Falls back to normalizing `candidate.skills` only when normalized list is empty.
 */
export function resolveCandidateSkillsForOverlap(
  candidate: RecommendationCandidateInput
): string[] {
  const normalized = (candidate.normalizedSkills ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (normalized.length > 0) return normalized;
  return normalizeSkills(candidate.skills ?? []);
}

/**
 * Compare `candidate.normalizedSkills` to `job.requiredSkills` (+ preferred bonus).
 *
 * Rules:
 * 1. Required coverage drives the base score (`requiredMatchPercent`).
 * 2. Preferred matches add a capped bonus (`preferredSkillsBonus`).
 * 3. Extra candidate-only skills never reduce required coverage.
 */
export function computeCandidateSkillOverlap(
  job: RecommendationJobInput,
  candidate: RecommendationCandidateInput
): CandidateSkillOverlapResult {
  const { requiredRaw, preferredRaw } = resolveJobSkillLists(job);
  const candidateForMatch: RecommendationCandidateInput = {
    ...candidate,
    normalizedSkills: resolveCandidateSkillsForOverlap(candidate),
  };

  const requiredMatch = matchJobSkills(candidateForMatch, requiredRaw, []);
  const preferredMatch =
    preferredRaw.length > 0
      ? matchJobSkills(candidateForMatch, [], preferredRaw)
      : {
          matchedPreferredSkills: [] as string[],
          preferredSkillsBonus: 0,
        };

  const requiredMatchPercent = roundScore(
    clampPercent(requiredMatch.requiredSkillsMatchPercent)
  );

  const preferredMatchPercent =
    preferredRaw.length === 0
      ? 0
      : roundScore(
          clampPercent(
            (preferredMatch.matchedPreferredSkills.length / preferredRaw.length) * 100
          )
        );

  const preferredSkillsBonus = roundScore(
    clampPercent(
      Math.min(
        CANDIDATE_SKILL_PREFERRED_BONUS_MAX,
        preferredMatch.preferredSkillsBonus
      )
    )
  );

  let skillScore: number;
  if (requiredRaw.length === 0) {
    skillScore =
      preferredRaw.length === 0
        ? 70
        : roundScore(clampPercent(Math.min(100, preferredSkillsBonus * 2)));
  } else {
    skillScore = roundScore(
      clampPercent(Math.min(100, requiredMatchPercent + preferredSkillsBonus))
    );
  }

  return {
    matchedSkills: [...requiredMatch.matchedSkills],
    missingSkills: [...requiredMatch.missingSkills],
    matchedPreferredSkills: [...preferredMatch.matchedPreferredSkills],
    requiredMatchPercent,
    preferredMatchPercent,
    preferredSkillsBonus,
    skillScore,
  };
}
