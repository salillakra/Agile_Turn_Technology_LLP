import { normalizeSkill } from "@/src/lib/skill-normalizer";

export type CandidateSkillRecencyInput = {
  updatedAt?: Date | string | null;
  currentDesignation?: string | null;
  currentCompany?: string | null;
  candidateSkills?: readonly { skillName: string; createdAt?: Date | string | null }[];
};

export type CandidateSkillRecencyResult = {
  skillRecencyScore: number;
  profileFreshnessScore: number;
  matchedSkillsRecencyScore: number;
  currentRoleSignalScore: number;
  profileAgeDays: number | null;
};

const MS_PER_DAY = 86_400_000;

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function daysSince(date: Date, now = new Date()): number {
  return Math.max(0, (now.getTime() - date.getTime()) / MS_PER_DAY);
}

/**
 * Objective profile freshness from `candidate.updatedAt` (or parse/sync timestamp).
 */
export function scoreProfileFreshness(
  updatedAt: Date | string | null | undefined,
  now = new Date()
): { score: number; profileAgeDays: number | null } {
  const parsed = parseDate(updatedAt);
  if (!parsed) {
    return { score: 50, profileAgeDays: null };
  }

  const profileAgeDays = Math.round(daysSince(parsed, now));
  let score: number;
  if (profileAgeDays <= 30) score = 100;
  else if (profileAgeDays <= 90) score = 85;
  else if (profileAgeDays <= 180) score = 70;
  else if (profileAgeDays <= 365) score = 55;
  else score = 40;

  return { score: roundScore(score), profileAgeDays };
}

/**
 * For matched required skills, use newest `candidateSkills.createdAt` when rows exist;
 * otherwise inherit profile freshness.
 */
export function scoreMatchedSkillsRecency(params: {
  matchedSkills: readonly string[];
  profileFreshnessScore: number;
  candidateSkills?: readonly { skillName: string; createdAt?: Date | string | null }[];
  now?: Date;
}): number {
  const matched = params.matchedSkills.map((s) => s.trim()).filter(Boolean);
  if (matched.length === 0) {
    return roundScore(params.profileFreshnessScore * 0.6);
  }

  const rows = params.candidateSkills ?? [];
  if (rows.length === 0) {
    return roundScore(params.profileFreshnessScore);
  }

  const now = params.now ?? new Date();
  const matchedCanonical = new Set(matched.map((s) => normalizeSkill(s)).filter(Boolean));
  const ages: number[] = [];

  for (const row of rows) {
    const canonical = normalizeSkill(row.skillName);
    if (!canonical || !matchedCanonical.has(canonical)) continue;
    const created = parseDate(row.createdAt);
    if (created) ages.push(daysSince(created, now));
  }

  if (ages.length === 0) {
    return roundScore(params.profileFreshnessScore);
  }

  const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
  if (avgAge <= 90) return 95;
  if (avgAge <= 365) return 75;
  if (avgAge <= 730) return 55;
  return 35;
}

/** Current role labels imply actively used skills. */
export function scoreCurrentRoleRecencySignal(
  candidate: CandidateSkillRecencyInput
): number {
  const hasTitle = Boolean(candidate.currentDesignation?.trim());
  const hasCompany = Boolean(candidate.currentCompany?.trim());
  if (hasTitle && hasCompany) return 100;
  if (hasTitle || hasCompany) return 75;
  return 40;
}

/**
 * Skill recency (0–100): how recently matched job skills appear active on the profile.
 */
export function computeCandidateSkillRecency(
  candidate: CandidateSkillRecencyInput,
  matchedSkills: readonly string[]
): CandidateSkillRecencyResult {
  const { score: profileFreshnessScore, profileAgeDays } = scoreProfileFreshness(
    candidate.updatedAt
  );
  const matchedSkillsRecencyScore = scoreMatchedSkillsRecency({
    matchedSkills,
    profileFreshnessScore,
    candidateSkills: candidate.candidateSkills,
  });
  const currentRoleSignalScore = scoreCurrentRoleRecencySignal(candidate);

  const skillRecencyScore = roundScore(
    clampPercent(
      profileFreshnessScore * 0.45 +
        matchedSkillsRecencyScore * 0.4 +
        currentRoleSignalScore * 0.15
    )
  );

  return {
    skillRecencyScore,
    profileFreshnessScore,
    matchedSkillsRecencyScore,
    currentRoleSignalScore,
    profileAgeDays,
  };
}
