import { normalizeSkill, normalizeSkills } from "@/src/lib/skill-normalizer";

/** Candidate fields used for job recommendations (DB-agnostic DTO). */
export type RecommendationCandidateInput = {
  id?: string;
  skills?: string[];
  normalizedSkills?: string[];
  totalExperience?: number | null;
  relevantExperience?: number | null;
  /** Preferred work location (DB: `preferredWorkLocation`; same as “preferredLocation” in specs). */
  preferredWorkLocation?: string | null;
  currentDesignation?: string | null;
  positionRole?: string | null;
};

/** Job fields used for recommendations (DB-agnostic DTO). */
export type RecommendationJobInput = {
  id: string;
  title: string;
  location: string;
  yearsOfExperience?: number | null;
  /** First-class columns; falls back to `jobMeta` when empty. */
  requiredSkills?: string[];
  preferredSkills?: string[];
  jobMeta?: unknown;
};

/** Transparent output from required/preferred skill comparison. */
export type SkillMatchResult = {
  /** Job required labels that appear in `candidate.normalizedSkills` (after normalization). */
  matchedSkills: string[];
  /** Job required labels with no candidate match. */
  missingSkills: string[];
  /** `(matched required / total required) × 100`. Extra candidate skills do not reduce this. */
  requiredSkillsMatchPercent: number;
  /** Preferred labels matched (bonus signal only). */
  matchedPreferredSkills: string[];
  /** Points added to overall `matchScore` from preferred skills (0–`WEIGHT.preferredSkills`). */
  preferredSkillsBonus: number;
};

/** Transparent experience comparison (`totalExperience` vs `yearsOfExperience`). */
export type ExperienceMatchResult = {
  jobYearsOfExperience: number | null;
  candidateTotalExperience: number | null;
  meetsMinimum: boolean;
  exceedsSignificantly: boolean;
  /** Bonus points only (0–`WEIGHT.experienceMeetsMin + WEIGHT.experienceExceeds`); never penalizes below skills base. */
  experienceBonus: number;
};

export type JobRecommendation = {
  jobId: string;
  title: string;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  /** Required-skill match % (see `matchJobSkills`). */
  requiredSkillsMatchPercent: number;
  matchedPreferredSkills: string[];
  experienceBonus: number;
  meetsExperienceMinimum: boolean;
  exceedsExperienceSignificantly: boolean;
  locationBonus: number;
  locationMatched: boolean;
};

/** Transparent location comparison (`preferredWorkLocation` vs `job.location`). */
export type LocationMatchResult = {
  candidatePreferredLocation: string | null;
  jobLocation: string | null;
  locationMatched: boolean;
  /** Small bonus only (0 or `WEIGHT.locationMatch`); never penalizes non-match. */
  locationBonus: number;
};

/**
 * Scoring budget (skills-first):
 * - Required skills: up to 50 (primary signal)
 * - Preferred skills: up to 10 (bonus)
 * - Experience: up to 12 (bonus only)
 * - Location: up to 6 (small bonus only — must not dominate skills)
 * - Title: up to 8 (bonus)
 */
const WEIGHT = {
  requiredSkills: 50,
  preferredSkills: 10,
  experienceMeetsMin: 8,
  experienceExceeds: 4,
  locationMatch: 6,
  title: 8,
} as const;

/** Years above job minimum treated as "significantly exceeds". */
const EXPERIENCE_EXCEEDS_GAP_YEARS = 3;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseJobMeta(meta: unknown): {
  requiredSkills: string[];
  preferredSkills: string[];
  minimumExperienceYears: number | null;
} {
  const obj =
    meta != null && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : null;

  const pickStrings = (key: string): string[] => {
    const raw = obj?.[key];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
  };

  const minRaw = obj?.minimumExperienceYears;
  const minimumExperienceYears =
    minRaw != null && minRaw !== "" && Number.isFinite(Number(minRaw))
      ? Number(minRaw)
      : null;

  return {
    requiredSkills: pickStrings("requiredSkills"),
    preferredSkills: pickStrings("preferredSkills"),
    minimumExperienceYears,
  };
}

export function resolveJobSkillLists(job: RecommendationJobInput): {
  requiredRaw: string[];
  preferredRaw: string[];
} {
  const meta = parseJobMeta(job.jobMeta);
  /** Align with apply flow (`resume-match`): prefer `jobMeta` lists when present. */
  const requiredRaw =
    meta.requiredSkills.length > 0
      ? meta.requiredSkills
      : job.requiredSkills && job.requiredSkills.length > 0
        ? job.requiredSkills
        : [];
  const preferredRaw =
    meta.preferredSkills.length > 0
      ? meta.preferredSkills
      : job.preferredSkills && job.preferredSkills.length > 0
        ? job.preferredSkills
        : [];
  return { requiredRaw, preferredRaw };
}

/**
 * Canonical skill set for matching. Prefer `candidate.normalizedSkills`; fall back to
 * normalizing `candidate.skills` when arrays are not yet backfilled.
 */
export function resolveCandidateNormalizedSkillSet(
  candidate: RecommendationCandidateInput
): Set<string> {
  if (candidate.normalizedSkills && candidate.normalizedSkills.length > 0) {
    return new Set(candidate.normalizedSkills.map((s) => s.trim()).filter(Boolean));
  }
  return new Set(normalizeSkills(candidate.skills ?? []));
}

/**
 * Match `candidate.normalizedSkills` against job required + preferred skills.
 *
 * Required score: `matched required / total required` (0–100%). Candidate-only extras
 * (e.g. Node.js when not required) do not lower the required percentage.
 *
 * Preferred: bonus only — `(matched preferred / total preferred) × WEIGHT.preferredSkills`.
 */
export function matchJobSkills(
  candidate: RecommendationCandidateInput,
  jobRequiredSkillsRaw: readonly string[],
  jobPreferredSkillsRaw: readonly string[] = []
): SkillMatchResult {
  const candidateSkills = resolveCandidateNormalizedSkillSet(candidate);
  const requiredRaw = (jobRequiredSkillsRaw ?? [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  const preferredRaw = (jobPreferredSkillsRaw ?? [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean);

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const raw of requiredRaw) {
    const canonical = normalizeSkill(raw);
    if (canonical && candidateSkills.has(canonical)) {
      matchedSkills.push(raw);
    } else {
      missingSkills.push(raw);
    }
  }

  const requiredSkillsMatchPercent =
    requiredRaw.length === 0
      ? 100
      : Math.round((matchedSkills.length / requiredRaw.length) * 1000) / 10;

  const matchedPreferredSkills: string[] = [];
  for (const raw of preferredRaw) {
    const canonical = normalizeSkill(raw);
    if (canonical && candidateSkills.has(canonical)) {
      matchedPreferredSkills.push(raw);
    }
  }

  const preferredRatio =
    preferredRaw.length === 0 ? 0 : matchedPreferredSkills.length / preferredRaw.length;
  const preferredSkillsBonus = Math.round(preferredRatio * WEIGHT.preferredSkills * 10) / 10;

  return {
    matchedSkills,
    missingSkills,
    requiredSkillsMatchPercent,
    matchedPreferredSkills,
    preferredSkillsBonus,
  };
}

/** Job minimum years: `job.yearsOfExperience`, else `jobMeta.minimumExperienceYears`. */
export function resolveJobYearsOfExperience(job: RecommendationJobInput): number | null {
  if (job.yearsOfExperience != null && Number.isFinite(job.yearsOfExperience)) {
    return job.yearsOfExperience;
  }
  return parseJobMeta(job.jobMeta).minimumExperienceYears;
}

/**
 * Experience contributes **bonus points only** (not a heavy core weight).
 *
 * 1. Compare `candidate.totalExperience` to `job.yearsOfExperience`.
 * 2. Meets minimum → `WEIGHT.experienceMeetsMin` bonus.
 * 3. Exceeds by ≥ `EXPERIENCE_EXCEEDS_GAP_YEARS` → small `WEIGHT.experienceExceeds` bonus.
 * 4. Below minimum or unknown experience → 0 experience bonus (skills still drive rank).
 */
export function scoreExperienceMatch(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): ExperienceMatchResult {
  const jobYearsOfExperience = resolveJobYearsOfExperience(job);
  const candidateTotalExperience =
    candidate.totalExperience != null && Number.isFinite(candidate.totalExperience)
      ? candidate.totalExperience
      : null;

  if (jobYearsOfExperience == null || jobYearsOfExperience <= 0) {
    return {
      jobYearsOfExperience,
      candidateTotalExperience,
      meetsMinimum: true,
      exceedsSignificantly: false,
      experienceBonus: 0,
    };
  }

  if (candidateTotalExperience == null) {
    return {
      jobYearsOfExperience,
      candidateTotalExperience: null,
      meetsMinimum: false,
      exceedsSignificantly: false,
      experienceBonus: 0,
    };
  }

  const meetsMinimum = candidateTotalExperience >= jobYearsOfExperience;
  const exceedsSignificantly =
    meetsMinimum &&
    candidateTotalExperience >= jobYearsOfExperience + EXPERIENCE_EXCEEDS_GAP_YEARS;

  let experienceBonus = 0;
  if (meetsMinimum) {
    experienceBonus += WEIGHT.experienceMeetsMin;
  }
  if (exceedsSignificantly) {
    experienceBonus += WEIGHT.experienceExceeds;
  }

  return {
    jobYearsOfExperience,
    candidateTotalExperience,
    meetsMinimum,
    exceedsSignificantly,
    experienceBonus,
  };
}

export function normalizeLocation(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ");
}

function isRemoteLocation(normalized: string): boolean {
  return (
    normalized === "remote" ||
    normalized === "wfh" ||
    normalized === "work from home" ||
    normalized.includes("remote")
  );
}

/**
 * Returns true when `candidate.preferredWorkLocation` aligns with `job.location`.
 */
export function isLocationMatch(
  candidatePreferredLocation: string | null | undefined,
  jobLocation: string | null | undefined
): boolean {
  const pref = normalizeLocation(candidatePreferredLocation);
  const jobLoc = normalizeLocation(jobLocation);

  if (!pref || !jobLoc) return false;

  if (isRemoteLocation(pref) || isRemoteLocation(jobLoc)) return true;
  if (jobLoc === pref) return true;
  if (jobLoc.includes(pref) || pref.includes(jobLoc)) return true;

  return false;
}

/**
 * Location contributes a **small bonus only** (low weight vs skills).
 *
 * 1. Compare `candidate.preferredWorkLocation` with `job.location`.
 * 2. On match → `WEIGHT.locationMatch` bonus (6 points).
 * 3. No match or unknown preference → 0 bonus (skills remain primary).
 */
export function scoreLocationMatch(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): LocationMatchResult {
  const candidatePreferredLocation =
    candidate.preferredWorkLocation?.trim() || null;
  const jobLocation = job.location?.trim() || null;

  const locationMatched = isLocationMatch(
    candidatePreferredLocation,
    jobLocation
  );

  return {
    candidatePreferredLocation,
    jobLocation,
    locationMatched,
    locationBonus: locationMatched ? WEIGHT.locationMatch : 0,
  };
}

function titleTokens(value: string | null | undefined): Set<string> {
  const text = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const stop = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "in",
    "at",
    "to",
    "for",
    "with",
    "senior",
    "junior",
    "lead",
    "sr",
    "jr",
  ]);
  return new Set(
    text
      .split(/\s+/)
      .filter((t) => t.length > 1 && !stop.has(t))
  );
}

function scoreTitle(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): number {
  const jobTokens = titleTokens(job.title);
  if (jobTokens.size === 0) return Math.round(WEIGHT.title * 0.5);

  const candidateTokens = new Set([
    ...titleTokens(candidate.currentDesignation),
    ...titleTokens(candidate.positionRole),
  ]);
  if (candidateTokens.size === 0) return Math.round(WEIGHT.title * 0.5);

  let overlap = 0;
  for (const t of jobTokens) {
    if (candidateTokens.has(t)) overlap += 1;
  }

  const ratio = overlap / jobTokens.size;
  return ratio * WEIGHT.title;
}

function scoreJobForCandidate(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): JobRecommendation {
  const { requiredRaw, preferredRaw } = resolveJobSkillLists(job);

  const skillMatch = matchJobSkills(candidate, requiredRaw, preferredRaw);

  const requiredScore =
    requiredRaw.length === 0
      ? WEIGHT.requiredSkills
      : (skillMatch.requiredSkillsMatchPercent / 100) * WEIGHT.requiredSkills;

  const experienceMatch = scoreExperienceMatch(candidate, job);
  const locationMatch = scoreLocationMatch(candidate, job);
  const titleScore = scoreTitle(candidate, job);

  const matchScore = clampScore(
    requiredScore +
      skillMatch.preferredSkillsBonus +
      experienceMatch.experienceBonus +
      locationMatch.locationBonus +
      titleScore
  );

  return {
    jobId: job.id,
    title: job.title,
    matchScore,
    matchedSkills: skillMatch.matchedSkills,
    missingSkills: skillMatch.missingSkills,
    requiredSkillsMatchPercent: skillMatch.requiredSkillsMatchPercent,
    matchedPreferredSkills: skillMatch.matchedPreferredSkills,
    experienceBonus: experienceMatch.experienceBonus,
    meetsExperienceMinimum: experienceMatch.meetsMinimum,
    exceedsExperienceSignificantly: experienceMatch.exceedsSignificantly,
    locationBonus: locationMatch.locationBonus,
    locationMatched: locationMatch.locationMatched,
  };
}

/**
 * Experience sort key for tie-breaking (higher = better fit).
 * 3 — meets minimum and exceeds significantly
 * 2 — meets minimum only
 * 1 — below minimum or unknown candidate years when job requires experience
 */
function experienceCompatibilityRank(row: JobRecommendation): number {
  if (row.exceedsExperienceSignificantly) return 3;
  if (row.meetsExperienceMinimum) return 2;
  return 1;
}

/**
 * Sort order (best matches first):
 * 1. `matchScore` descending
 * 2. Count of matched **required** skills descending
 * 3. Experience compatibility (exceeds > meets > below)
 * 4. `experienceBonus` descending (finer tie within tier)
 * 5. `jobId` ascending (stable ordering)
 */
export function compareJobRecommendations(
  a: JobRecommendation,
  b: JobRecommendation
): number {
  if (b.matchScore !== a.matchScore) {
    return b.matchScore - a.matchScore;
  }

  const requiredMatchedDelta = b.matchedSkills.length - a.matchedSkills.length;
  if (requiredMatchedDelta !== 0) {
    return requiredMatchedDelta;
  }

  const experienceRankDelta =
    experienceCompatibilityRank(b) - experienceCompatibilityRank(a);
  if (experienceRankDelta !== 0) {
    return experienceRankDelta;
  }

  if (b.experienceBonus !== a.experienceBonus) {
    return b.experienceBonus - a.experienceBonus;
  }

  return a.jobId.localeCompare(b.jobId);
}

/**
 * Compare one candidate against many jobs, compute matchScore, return jobs ranked best-first.
 */
export function recommendJobs(
  candidate: RecommendationCandidateInput,
  jobs: readonly RecommendationJobInput[]
): JobRecommendation[] {
  const scored = (jobs ?? []).map((job) => scoreJobForCandidate(candidate, job));
  scored.sort(compareJobRecommendations);
  return scored;
}

export {
  rankJobsBySemanticSimilarity,
  scoreJobSemanticSimilarity,
  type SemanticJobRecommendation,
} from "@/src/lib/semantic-recommendation";

export {
  recommendJobsHybrid,
  scoreHybridJob,
  computeHybridFinalScore,
  HYBRID_RECOMMENDATION_WEIGHTS,
  type HybridJobRecommendation,
} from "@/src/lib/hybrid-recommendation";
