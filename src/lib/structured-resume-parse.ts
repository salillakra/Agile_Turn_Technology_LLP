import { truncateSummaryWithFullStop } from "@/src/lib/text-terminal-punctuation";
import { RESUME_PARSE_LIMITS } from "@/src/lib/resume-parse-limits";

/**
 * Canonical structured resume parse — mirrors POST /parse-resume (ai-service schema v8).
 *
 * Fixed field set; bump `schemaVersion` when adding or renaming keys.
 */

export const STRUCTURED_RESUME_PARSE_SCHEMA_VERSION = 10;

export type ResumeEducationEntry = {
  degree: string | null;
  college: string | null;
  graduationYear: number | null;
};

/** Structured parse payload (no rawText). */
export type StructuredResumeParse = {
  schemaVersion: number;
  skills: string[];
  normalizedSkills: string[];
  companies: string[];
  currentDesignation: string | null;
  education: ResumeEducationEntry[];
  certifications: string[];
  totalExperience: number;
  summary: string;
  /** Rule-based extraction confidence (0–1). */
  skillsConfidence: number;
  experienceConfidence: number;
  educationConfidence: number;
};

/** Full POST /parse-resume response from ai-service. */
export type ParseResumeApiResponse = StructuredResumeParse & {
  rawText: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isConfidenceScore(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isEducationEntry(value: unknown): value is ResumeEducationEntry {
  if (!isRecord(value)) return false;
  if (value.degree !== null && typeof value.degree !== "string") return false;
  if (value.college !== null && typeof value.college !== "string") return false;
  if (value.graduationYear !== null && typeof value.graduationYear !== "number") return false;
  return true;
}

/** Validate unknown JSON from ai-service `POST /parse-resume`. */
export function isStructuredResumeParse(value: unknown): value is StructuredResumeParse {
  if (!isRecord(value)) return false;
  if (typeof value.schemaVersion !== "number") return false;
  if (!Array.isArray(value.skills) || !value.skills.every((s) => typeof s === "string")) {
    return false;
  }
  if (
    !Array.isArray(value.normalizedSkills) ||
    !value.normalizedSkills.every((s) => typeof s === "string")
  ) {
    return false;
  }
  if (!Array.isArray(value.companies) || !value.companies.every((s) => typeof s === "string")) {
    return false;
  }
  if (value.currentDesignation !== null && typeof value.currentDesignation !== "string") {
    return false;
  }
  if (!Array.isArray(value.education) || !value.education.every(isEducationEntry)) {
    return false;
  }
  if (
    !Array.isArray(value.certifications) ||
    !value.certifications.every((s) => typeof s === "string")
  ) {
    return false;
  }
  if (typeof value.totalExperience !== "number" || !Number.isFinite(value.totalExperience)) {
    return false;
  }
  if (typeof value.summary !== "string") return false;
  if (!isConfidenceScore(value.skillsConfidence)) return false;
  if (!isConfidenceScore(value.experienceConfidence)) return false;
  if (!isConfidenceScore(value.educationConfidence)) return false;
  return true;
}

export function isParseResumeApiResponse(value: unknown): value is ParseResumeApiResponse {
  if (!isStructuredResumeParse(value)) return false;
  if (!isRecord(value)) return false;
  return typeof value.rawText === "string";
}

/** Map ai-service structured parse → `ResumeParseJob.resultJson` (legacy + embedded structured). */
export function structuredResumeParseToResultJson(
  parsed: StructuredResumeParse,
  fallbackName: string
): {
  name: string;
  skills: string[];
  experience: { years: number; summary: string };
  structured: StructuredResumeParse;
} {
  const summaryRaw = parsed.summary?.trim() || "No summary extracted.";
  return {
    name: fallbackName,
    skills: parsed.skills.length > 0 ? parsed.skills : parsed.normalizedSkills,
    experience: {
      years: parsed.totalExperience,
      summary: truncateSummaryWithFullStop(summaryRaw, RESUME_PARSE_LIMITS.MAX_SUMMARY_LEN),
    },
    structured: parsed,
  };
}
