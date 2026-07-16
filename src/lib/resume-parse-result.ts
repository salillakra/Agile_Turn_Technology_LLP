import type { StructuredResumeParse } from "@/src/lib/structured-resume-parse";
import { isStructuredResumeParse } from "@/src/lib/structured-resume-parse";
import type { HybridParseMeta } from "@/src/lib/resume-parse/llm-parse-types";

/**
 * Canonical shape for `ResumeParseJob.resultJson` after a successful parse.
 * Workers should write only this structure (or a documented superset) for consistent UI and APIs.
 */
export type ResumeParseExperience = {
  /** Total or relevant years of experience as a single number for filtering/matching. */
  years: number;
  /** Free-text summary (e.g. roles, industries) for display and search. */
  summary: string;
};

/**
 * Parsed resume payload stored in the database as JSON (`resultJson`).
 */
export type ResumeParseResult = {
  name: string;
  skills: string[];
  experience: ResumeParseExperience;
  /** Full NLP structured parse when produced by ai-service (schema v10). */
  structured?: StructuredResumeParse;
  /** Hybrid parse metadata (rule + LLM sources, disagreement flags). */
  hybrid?: HybridParseMeta;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Narrow unknown JSON from Prisma to `ResumeParseResult` when reading `resultJson`. */
export function isResumeParseResult(value: unknown): value is ResumeParseResult {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string") return false;
  if (!Array.isArray(value.skills) || !value.skills.every((s) => typeof s === "string")) {
    return false;
  }
  if (!isRecord(value.experience)) return false;
  const exp = value.experience;
  if (typeof exp.years !== "number" || !Number.isFinite(exp.years)) return false;
  if (typeof exp.summary !== "string") return false;
  if (value.structured !== undefined && !isStructuredResumeParse(value.structured)) {
    return false;
  }
  return true;
}
