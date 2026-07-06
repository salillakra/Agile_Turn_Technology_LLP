import { parseEducationJson } from "@/src/lib/candidate-structured-profile";
import { resolveCandidateSkillsForOverlap } from "@/src/lib/ai/candidate-skill-overlap";
import type { RecommendationCandidateInput } from "@/src/lib/recommendation-engine";

/** Objective sub-scores (0–100 each) — no LLM or human ratings. */
export type ResumeQualitySignalScores = {
  completenessScore: number;
  skillsRichnessScore: number;
  experienceRichnessScore: number;
  educationPresenceScore: number;
  certificationsPresenceScore: number;
};

export type ResumeQualityScoreWeights = {
  completeness: number;
  skillsRichness: number;
  experienceRichness: number;
  educationPresence: number;
  certificationsPresence: number;
};

export const DEFAULT_RESUME_QUALITY_WEIGHTS: ResumeQualityScoreWeights = {
  completeness: 0.3,
  skillsRichness: 0.25,
  experienceRichness: 0.25,
  educationPresence: 0.1,
  certificationsPresence: 0.1,
};

/** Profile fields used for deterministic resume quality (from Candidate + parse). */
export type CandidateResumeQualityInput = RecommendationCandidateInput & {
  candidateName?: string | null;
  email?: string | null;
  currentCompany?: string | null;
  currentDesignation?: string | null;
  summary?: string | null;
  companies?: readonly string[] | null;
  education?: unknown | null;
  certifications?: readonly string[] | null;
  updatedAt?: Date | string | null;
  candidateSkills?: readonly { skillName: string; createdAt?: Date | string | null }[];
};

export type CandidateResumeQualityResult = ResumeQualitySignalScores & {
  resumeQualityScore: number;
  weights: ResumeQualityScoreWeights;
  /** Checklist fields present (for explainability). */
  completenessFieldsPresent: number;
  completenessFieldsTotal: number;
  skillCount: number;
  companyCount: number;
  educationEntryCount: number;
  certificationCount: number;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Core ATS fields present on the profile (binary checklist → percent).
 */
export function scoreResumeCompleteness(
  candidate: CandidateResumeQualityInput
): { score: number; present: number; total: number } {
  const skills = resolveCandidateSkillsForOverlap(candidate);
  const education = parseEducationJson(candidate.education);
  const companies = (candidate.companies ?? []).filter((c) => hasText(c));

  const checks = [
    hasText(candidate.candidateName),
    hasText(candidate.email),
    hasText(candidate.currentDesignation) || hasText(candidate.currentCompany),
    candidate.totalExperience != null && Number.isFinite(candidate.totalExperience),
    hasText(candidate.summary) || companies.length > 0,
    skills.length > 0,
    hasText(candidate.preferredWorkLocation),
  ];

  const present = checks.filter(Boolean).length;
  const total = checks.length;
  const score = total === 0 ? 0 : roundScore(clampPercent((present / total) * 100));

  return { score, present, total };
}

/**
 * Skill count tiers (quantity only — not skill "quality").
 */
export function scoreSkillsRichness(candidate: CandidateResumeQualityInput): number {
  const count = resolveCandidateSkillsForOverlap(candidate).length;
  if (count <= 0) return 0;
  if (count === 1) return 35;
  if (count === 2) return 50;
  if (count <= 4) return 65;
  if (count <= 7) return 80;
  if (count <= 12) return 92;
  return 100;
}

/**
 * Experience signals: YoE recorded, employer history depth, current role labels.
 */
export function scoreExperienceRichness(candidate: CandidateResumeQualityInput): number {
  let points = 0;

  if (candidate.totalExperience != null && Number.isFinite(candidate.totalExperience)) {
    points += 35;
  }
  if (hasText(candidate.currentDesignation)) {
    points += 15;
  }
  if (hasText(candidate.currentCompany)) {
    points += 15;
  }

  const companyCount = (candidate.companies ?? []).filter((c) => hasText(c)).length;
  if (companyCount >= 1) points += 15;
  if (companyCount >= 2) points += 10;
  if (companyCount >= 4) points += 10;

  return roundScore(clampPercent(points));
}

/**
 * Education rows from structured parse (`education` JSON).
 */
export function scoreEducationPresence(candidate: CandidateResumeQualityInput): number {
  const entries = parseEducationJson(candidate.education) ?? [];
  if (entries.length === 0) return 0;

  const substantive = entries.filter(
    (e) => hasText(e.degree) || hasText(e.college) || e.graduationYear != null
  ).length;

  if (substantive <= 0) return 0;
  if (substantive === 1) return 75;
  return 100;
}

/**
 * Certification count tiers (presence only).
 */
export function scoreCertificationsPresence(candidate: CandidateResumeQualityInput): number {
  const count = (candidate.certifications ?? []).filter((c) => hasText(c)).length;
  if (count <= 0) return 0;
  if (count === 1) return 70;
  if (count === 2) return 85;
  return 100;
}

/**
 * Deterministic resume / profile quality (0–100).
 * Feeds confidence and recruiter "profile ready for review" signals — not job fit.
 */
export function computeResumeQualityScore(
  candidate: CandidateResumeQualityInput,
  weights: ResumeQualityScoreWeights = DEFAULT_RESUME_QUALITY_WEIGHTS
): CandidateResumeQualityResult {
  const completeness = scoreResumeCompleteness(candidate);
  const completenessScore = completeness.score;
  const skillsRichnessScore = scoreSkillsRichness(candidate);
  const experienceRichnessScore = scoreExperienceRichness(candidate);
  const educationPresenceScore = scoreEducationPresence(candidate);
  const certificationsPresenceScore = scoreCertificationsPresence(candidate);

  const resumeQualityScore = roundScore(
    clampPercent(
      completenessScore * weights.completeness +
        skillsRichnessScore * weights.skillsRichness +
        experienceRichnessScore * weights.experienceRichness +
        educationPresenceScore * weights.educationPresence +
        certificationsPresenceScore * weights.certificationsPresence
    )
  );

  const skillCount = resolveCandidateSkillsForOverlap(candidate).length;
  const companyCount = (candidate.companies ?? []).filter((c) => hasText(c)).length;
  const educationEntryCount = parseEducationJson(candidate.education)?.length ?? 0;
  const certificationCount = (candidate.certifications ?? []).filter((c) => hasText(c)).length;

  return {
    resumeQualityScore,
    completenessScore,
    skillsRichnessScore,
    experienceRichnessScore,
    educationPresenceScore,
    certificationsPresenceScore,
    weights,
    completenessFieldsPresent: completeness.present,
    completenessFieldsTotal: completeness.total,
    skillCount,
    companyCount,
    educationEntryCount,
    certificationCount,
  };
}
