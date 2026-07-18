import { normalizeLocation } from "@/src/lib/recommendation-engine";
import { normalizeKnownSkill, normalizeSkill } from "@/src/lib/skill-normalizer";

function tokenizeQuery(query: string): string[] {
  const clean = query
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-");
  if (!clean) return [];
  return clean.split(/[^a-z0-9+#.]+/g).map((t) => t.trim()).filter(Boolean);
}

/**
 * Extract canonical skill tokens from a natural-language query.
 * Uses 1-gram and 2-gram normalization to catch phrases like "amazon web services".
 */
export function extractQuerySkillTokens(query: string): string[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const candidates: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    candidates.push(tokens[i]!);
    if (i + 1 < tokens.length) {
      candidates.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const canonical = normalizeSkill(raw);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
  }

  return result;
}

export type RecruiterQueryIntent = {
  /** Canonical skill tokens implied by the query (e.g. react, aws). Soft re-rank. */
  requiredSkillTokens: string[];
  /**
   * Known-alias skills only — used as SQL hard filters (must have all).
   * Caps at 5 to avoid over-constraining long queries.
   */
  mustHaveSkillTokens: string[];
  /** Minimum years of experience if detected; otherwise null. */
  minimumExperienceYears: number | null;
  /** Location hint from query (e.g. "bangalore", "remote"); null if none. */
  locationHint: string | null;
};

const MAX_MUST_HAVE_SKILLS = 5;

/** Extract only alias-mapped skills for hard filters. */
export function extractMustHaveSkillTokens(query: string): string[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const candidates: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    candidates.push(tokens[i]!);
    if (i + 1 < tokens.length) {
      candidates.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const canonical = normalizeKnownSkill(raw);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
    if (result.length >= MAX_MUST_HAVE_SKILLS) break;
  }
  return result;
}

const EXPERIENCE_PATTERNS = [
  /(\d+)\s*\+\s*(?:years?|yrs?)\b/i,
  /(\d+)\s*(?:years?|yrs?)\s+(?:of\s+)?experience\b/i,
  /(?:at\s+least|minimum|min)\s+(\d+)\s*(?:years?|yrs?)\b/i,
  /(\d+)\s*(?:years?|yrs?)\b/i,
];

const LOCATION_PATTERNS = [
  /\b(?:in|based in|located in|from)\s+([a-z][a-z\s-]{2,40})/i,
  /\b(remote|wfh|work from home|hybrid)\b/i,
];

function extractMinimumExperienceYears(query: string): number | null {
  for (const pattern of EXPERIENCE_PATTERNS) {
    const match = query.match(pattern);
    if (!match?.[1]) continue;
    const years = Number(match[1]);
    if (Number.isFinite(years) && years >= 0 && years <= 50) {
      return Math.trunc(years);
    }
  }
  return null;
}

function extractLocationHint(query: string): string | null {
  const remote = query.match(/\b(remote|wfh|work from home|hybrid)\b/i);
  if (remote?.[1]) {
    return normalizeLocation(remote[1]);
  }

  for (const pattern of LOCATION_PATTERNS) {
    const match = query.match(pattern);
    if (!match?.[1]) continue;
    const loc = normalizeLocation(match[1].replace(/\s+(with|and|who|that)\b.*$/i, "").trim());
    if (loc.length >= 2) return loc;
  }

  return null;
}

/** Parse recruiter NL query into structured signals for hybrid ranking. */
export function parseRecruiterQueryIntent(query: string): RecruiterQueryIntent {
  const q = query.trim();
  const mustHaveSkillTokens = extractMustHaveSkillTokens(q);
  return {
    requiredSkillTokens: extractQuerySkillTokens(q),
    mustHaveSkillTokens,
    minimumExperienceYears: extractMinimumExperienceYears(q),
    locationHint: extractLocationHint(q),
  };
}

/** Virtual job DTO for reusing job↔candidate scoring helpers. */
export function queryIntentToVirtualJob(intent: RecruiterQueryIntent): {
  id: string;
  title: string;
  location: string;
  yearsOfExperience: number | null;
  requiredSkills: string[];
} {
  return {
    id: "recruiter-query",
    title: "Recruiter search",
    location: intent.locationHint ?? "",
    yearsOfExperience: intent.minimumExperienceYears,
    requiredSkills: intent.requiredSkillTokens,
  };
}
