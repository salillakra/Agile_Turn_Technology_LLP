import {
  resolveJobYearsOfExperience,
  type RecommendationCandidateInput,
  type RecommendationJobInput,
} from "@/src/lib/recommendation-engine";

/** Years below job minimum → major underqualification band. */
export const EXPERIENCE_MAJOR_UNDER_GAP_YEARS = 3;

/** Candidate within this many years above minimum → peak alignment band. */
export const EXPERIENCE_CLOSE_ALIGN_UPPER_YEARS = 2;

/** Beyond job minimum + this gap → diminishing returns (avoid over-reward). */
export const EXPERIENCE_OVERQUALIFIED_CAP_GAP_YEARS = 5;

/** Ratio below this vs job minimum → major underqualification. */
export const EXPERIENCE_MAJOR_UNDER_RATIO = 0.5;

export type CandidateExperienceCompatibilityResult = {
  jobYearsOfExperience: number | null;
  candidateTotalExperience: number | null;
  /** `candidateTotalExperience − jobYearsOfExperience` (years). */
  experienceGapYears: number | null;
  meetsExperienceMinimum: boolean;
  isMajorUnderqualification: boolean;
  /** 0–100 balanced experience fit for hybrid / candidate fit scoring. */
  experienceScore: number;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function readCandidateTotalExperienceYears(
  candidate: RecommendationCandidateInput
): number | null {
  const raw = candidate.totalExperience;
  return raw != null && Number.isFinite(raw) ? raw : null;
}

/**
 * Experience compatibility: `candidate.totalExperience` vs `job.yearsOfExperience`.
 *
 * - Major underqualification → low `experienceScore` (5–25 band).
 * - Slight under → moderate penalty (48–92 ramp).
 * - Close alignment at/just above minimum → high score (~92–96).
 * - Moderate overqualification → good but not peak (84).
 * - Far overqualification → tapered down (no over-reward).
 */
export function computeCandidateExperienceCompatibility(
  job: RecommendationJobInput,
  candidate: RecommendationCandidateInput
): CandidateExperienceCompatibilityResult {
  const jobYearsOfExperience = resolveJobYearsOfExperience(job);
  const candidateTotalExperience = readCandidateTotalExperienceYears(candidate);

  if (jobYearsOfExperience == null || jobYearsOfExperience <= 0) {
    return {
      jobYearsOfExperience,
      candidateTotalExperience,
      experienceGapYears: null,
      meetsExperienceMinimum: true,
      isMajorUnderqualification: false,
      experienceScore: 70,
    };
  }

  if (candidateTotalExperience == null) {
    return {
      jobYearsOfExperience,
      candidateTotalExperience: null,
      experienceGapYears: null,
      meetsExperienceMinimum: false,
      isMajorUnderqualification: true,
      experienceScore: 20,
    };
  }

  const experienceGapYears = candidateTotalExperience - jobYearsOfExperience;
  const meetsExperienceMinimum = experienceGapYears >= 0;
  const ratioToJob = candidateTotalExperience / jobYearsOfExperience;

  const isMajorUnderqualification =
    experienceGapYears <= -EXPERIENCE_MAJOR_UNDER_GAP_YEARS ||
    ratioToJob < EXPERIENCE_MAJOR_UNDER_RATIO;

  let experienceScore: number;

  if (isMajorUnderqualification) {
    const severity = clampPercent(
      (ratioToJob / EXPERIENCE_MAJOR_UNDER_RATIO) * 100
    );
    experienceScore = roundScore(5 + (severity / 100) * 20);
  } else if (experienceGapYears < 0) {
    const t =
      (experienceGapYears + EXPERIENCE_MAJOR_UNDER_GAP_YEARS) /
      EXPERIENCE_MAJOR_UNDER_GAP_YEARS;
    experienceScore = roundScore(clampPercent(48 + t * 44));
  } else if (experienceGapYears <= EXPERIENCE_CLOSE_ALIGN_UPPER_YEARS) {
    experienceScore = roundScore(clampPercent(96 - experienceGapYears * 2));
  } else if (experienceGapYears <= EXPERIENCE_OVERQUALIFIED_CAP_GAP_YEARS) {
    experienceScore = 84;
  } else {
    const excess = experienceGapYears - EXPERIENCE_OVERQUALIFIED_CAP_GAP_YEARS;
    experienceScore = roundScore(clampPercent(84 - excess * 1.5));
  }

  return {
    jobYearsOfExperience,
    candidateTotalExperience,
    experienceGapYears,
    meetsExperienceMinimum,
    isMajorUnderqualification,
    experienceScore,
  };
}

/** Recruiter-facing one-liner for fit breakdowns. */
export function buildCandidateExperienceMatchText(
  result: CandidateExperienceCompatibilityResult
): string {
  const required = result.jobYearsOfExperience;
  if (required == null || required <= 0) {
    return "No minimum experience specified for this role.";
  }

  const candidateYears = result.candidateTotalExperience;
  if (candidateYears == null) {
    return `Experience not recorded on profile; role requires ${required}+ years.`;
  }

  if (result.isMajorUnderqualification) {
    return `Major experience gap (${candidateYears} years vs ${required}+ required).`;
  }

  if (result.meetsExperienceMinimum) {
    if (
      result.experienceGapYears != null &&
      result.experienceGapYears <= EXPERIENCE_CLOSE_ALIGN_UPPER_YEARS
    ) {
      return `Close experience alignment (${candidateYears} years vs ${required} required).`;
    }
    if (
      result.experienceGapYears != null &&
      result.experienceGapYears > EXPERIENCE_OVERQUALIFIED_CAP_GAP_YEARS
    ) {
      return `Exceeds experience requirement (${candidateYears} years vs ${required} required); score capped to avoid over-weighting seniority.`;
    }
    return `Meets experience requirement (${candidateYears} years vs ${required} required).`;
  }

  return `Below experience requirement (${candidateYears} years vs ${required} required).`;
}
