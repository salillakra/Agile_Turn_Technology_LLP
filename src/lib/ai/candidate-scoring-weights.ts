/**
 * Final hybrid candidate fit formula (weights sum to 1.0).
 *
 * candidateFitScore =
 *   30% semantic + 35% skill + 15% experience + 10% skill recency +
 *   5% resume quality + 3% certifications + 2% location
 */

/** Full hybrid blend when semantic similarity is available. */
export const HYBRID_CANDIDATE_FIT_WEIGHTS = {
  semantic: 0.3,
  skill: 0.35,
  experience: 0.15,
  skillRecency: 0.1,
  resumeQuality: 0.05,
  certifications: 0.03,
  location: 0.02,
} as const;

/**
 * Renormalized when semantic is unavailable (semantic's 30% redistributed).
 * Non-semantic sum was 70% → each weight / 0.7.
 */
export const HYBRID_CANDIDATE_FIT_WEIGHTS_WITHOUT_SEMANTIC = {
  skill: 0.5,
  experience: 0.2143,
  skillRecency: 0.1429,
  resumeQuality: 0.0714,
  certifications: 0.0429,
  location: 0.0286,
} as const;

/** @deprecated Use {@link HYBRID_CANDIDATE_FIT_WEIGHTS}. */
export const CANDIDATE_FIT_SCORING_WEIGHTS = {
  semantic: HYBRID_CANDIDATE_FIT_WEIGHTS.semantic,
  skill: HYBRID_CANDIDATE_FIT_WEIGHTS.skill,
  experience: HYBRID_CANDIDATE_FIT_WEIGHTS.experience,
  location: HYBRID_CANDIDATE_FIT_WEIGHTS.location,
} as const;

/** @deprecated Use {@link HYBRID_CANDIDATE_FIT_WEIGHTS_WITHOUT_SEMANTIC}. */
export const CANDIDATE_FIT_WEIGHTS_WITHOUT_SEMANTIC = {
  skill: HYBRID_CANDIDATE_FIT_WEIGHTS_WITHOUT_SEMANTIC.skill,
  experience: HYBRID_CANDIDATE_FIT_WEIGHTS_WITHOUT_SEMANTIC.experience,
  location: HYBRID_CANDIDATE_FIT_WEIGHTS_WITHOUT_SEMANTIC.location,
} as const;

export type HybridCandidateFitComponents = {
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  skillRecencyScore: number;
  resumeQualityScore: number;
  certificationScore: number;
  locationScore: number;
};

export type HybridCandidateFitContribution = {
  id: keyof typeof HYBRID_CANDIDATE_FIT_WEIGHTS;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  available: boolean;
};

export type HybridCandidateFitScoreResult = {
  candidateFitScore: number;
  contributions: HybridCandidateFitContribution[];
  weightsProfile: "full" | "without_semantic";
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

const FACTOR_LABELS: Record<keyof typeof HYBRID_CANDIDATE_FIT_WEIGHTS, string> = {
  semantic: "Semantic similarity",
  skill: "Skill overlap",
  experience: "Experience compatibility",
  skillRecency: "Skill recency",
  resumeQuality: "Resume quality",
  certifications: "Certification relevance",
  location: "Location compatibility",
};

/**
 * Final hybrid `candidateFitScore` on 0–100.
 */
export function computeCandidateFitScore(
  components: HybridCandidateFitComponents,
  options?: { hasSemanticSignal?: boolean }
): HybridCandidateFitScoreResult {
  const hasSemantic = options?.hasSemanticSignal !== false;
  const weights = hasSemantic
    ? HYBRID_CANDIDATE_FIT_WEIGHTS
    : ({
        ...HYBRID_CANDIDATE_FIT_WEIGHTS_WITHOUT_SEMANTIC,
        semantic: 0,
      } as const);

  const contributions: HybridCandidateFitContribution[] = [];
  let raw = 0;

  const add = (
    id: keyof typeof HYBRID_CANDIDATE_FIT_WEIGHTS,
    score: number,
    available: boolean
  ) => {
    const weight = id === "semantic" && !hasSemantic ? 0 : (weights as Record<string, number>)[id] ?? 0;
    const contribution = available && weight > 0 ? weight * clampPercent(score) : 0;
    if (available && weight > 0) raw += contribution;
    contributions.push({
      id,
      label: FACTOR_LABELS[id],
      score: roundScore(clampPercent(score)),
      weight,
      contribution: roundScore(contribution),
      available: id === "semantic" ? hasSemantic : available,
    });
  };

  add("semantic", components.semanticScore, hasSemantic);
  add("skill", components.skillScore, true);
  add("experience", components.experienceScore, true);
  add("skillRecency", components.skillRecencyScore, true);
  add("resumeQuality", components.resumeQualityScore, true);
  add("certifications", components.certificationScore, true);
  add("location", components.locationScore, true);

  return {
    candidateFitScore: roundScore(clampPercent(raw)),
    contributions,
    weightsProfile: hasSemantic ? "full" : "without_semantic",
  };
}

/** @deprecated Use {@link computeCandidateFitScore}. */
export type CandidateFitScoreComponents = {
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  locationScore: number;
};

/** @deprecated Use {@link computeCandidateFitScore}. */
export function computeCandidateFitFinalScore(
  components: CandidateFitScoreComponents,
  options?: { hasSemanticSignal?: boolean }
): number {
  return computeCandidateFitScore(
    {
      semanticScore: components.semanticScore,
      skillScore: components.skillScore,
      experienceScore: components.experienceScore,
      skillRecencyScore: 50,
      resumeQualityScore: 50,
      certificationScore: 0,
      locationScore: components.locationScore,
    },
    options
  ).candidateFitScore;
}

export function computeSemanticWeightedContribution(
  semanticScore: number,
  weight: number = HYBRID_CANDIDATE_FIT_WEIGHTS.semantic
): number {
  return roundScore(weight * clampPercent(semanticScore));
}
