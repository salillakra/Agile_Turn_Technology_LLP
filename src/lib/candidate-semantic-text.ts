import { ensureEndsWithFullStop } from "@/src/lib/text-terminal-punctuation";
import { RESUME_PARSE_LIMITS } from "@/src/lib/resume-parse-limits";

const MAX_SKILLS_LISTED = RESUME_PARSE_LIMITS.MAX_SKILLS;
const MAX_SUMMARY_CHARS = RESUME_PARSE_LIMITS.MAX_SUMMARY_LEN;
const MAX_NOTES_CHARS = 200;
const MAX_SEMANTIC_TEXT_CHARS = 2000;

export type CandidateSemanticTextInput = {
  skills?: readonly string[];
  candidateSkills?: readonly { skillName: string }[];
  currentDesignation?: string | null;
  positionRole?: string | null;
  totalExperience?: number | null;
  relevantExperience?: number | null;
  /** Stored `Candidate.summary` or parse fallback. */
  resumeSummary?: string | null;
  companies?: readonly string[];
  certifications?: readonly string[];
  education?: readonly {
    degree: string | null;
    college: string | null;
    graduationYear: number | null;
  }[];
  notes?: readonly string[];
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1).trim()}…`;
}

function resolveSkills(input: CandidateSemanticTextInput): string[] {
  if (input.skills && input.skills.length > 0) {
    return input.skills.map((s) => s.trim()).filter(Boolean).slice(0, MAX_SKILLS_LISTED);
  }
  if (input.candidateSkills && input.candidateSkills.length > 0) {
    return input.candidateSkills
      .map((s) => s.skillName.trim())
      .filter(Boolean)
      .slice(0, MAX_SKILLS_LISTED);
  }
  return [];
}

function resolveDesignation(input: CandidateSemanticTextInput): string {
  const designation =
    (typeof input.currentDesignation === "string" ? input.currentDesignation.trim() : "") ||
    (typeof input.positionRole === "string" ? input.positionRole.trim() : "");
  return designation || "Professional";
}

function resolveExperienceYears(input: CandidateSemanticTextInput): number | null {
  const total =
    input.totalExperience != null && Number.isFinite(input.totalExperience)
      ? input.totalExperience
      : null;
  const relevant =
    input.relevantExperience != null && Number.isFinite(input.relevantExperience)
      ? input.relevantExperience
      : null;
  return total ?? relevant;
}

function joinNotes(notes: readonly string[]): string {
  const merged = notes
    .map((n) => collapseWhitespace(n))
    .filter(Boolean)
    .join(" · ");
  return truncate(merged, MAX_NOTES_CHARS);
}

export type ParseSemanticProfileInput = {
  skills: readonly string[];
  summary: string | null | undefined;
  designation: string | null | undefined;
  experienceYears: number | null | undefined;
};

/**
 * Build embeddable text from NLP parse outputs (skills, summary, designation, experience).
 * Used immediately after resume parse before the embedding worker runs.
 */
export function buildCandidateSemanticTextFromParse(
  input: ParseSemanticProfileInput
): string {
  return buildCandidateSemanticText({
    skills: [...input.skills],
    currentDesignation: input.designation ?? null,
    totalExperience: input.experienceYears ?? null,
    resumeSummary: input.summary ?? null,
  });
}

/**
 * Combine structured candidate fields into one embeddable profile for the AI service.
 */
export function buildCandidateSemanticText(input: CandidateSemanticTextInput): string {
  const designation = resolveDesignation(input);
  const skills = resolveSkills(input);
  const years = resolveExperienceYears(input);
  const summaryRaw =
    typeof input.resumeSummary === "string" ? collapseWhitespace(input.resumeSummary) : "";
  const summary = summaryRaw
    ? ensureEndsWithFullStop(truncate(summaryRaw, MAX_SUMMARY_CHARS))
    : "";
  const notesRaw = input.notes ?? [];
  const notes = notesRaw.length > 0 ? joinNotes(notesRaw) : "";

  const parts: string[] = [`${designation} profile.`];

  if (skills.length > 0) {
    parts.push(`Skills: ${skills.join(", ")}.`);
  }
  if (years != null && years > 0) {
    parts.push(`Experience: ${years} years.`);
  }
  if (summary) {
    parts.push(summary);
  }
  const companies = (input.companies ?? [])
    .map((c) => collapseWhitespace(c))
    .filter(Boolean)
    .slice(0, 5);
  if (companies.length > 0) {
    parts.push(`Companies: ${companies.join(", ")}.`);
  }
  const certs = (input.certifications ?? [])
    .map((c) => collapseWhitespace(c))
    .filter(Boolean)
    .slice(0, 4);
  if (certs.length > 0) {
    parts.push(`Certifications: ${certs.join("; ")}.`);
  }
  const educationBits = (input.education ?? [])
    .map((e) => {
      const bits = [e.degree, e.college].filter(Boolean).join(", ");
      if (!bits) return "";
      return e.graduationYear != null ? `${bits} (${e.graduationYear})` : bits;
    })
    .filter(Boolean)
    .slice(0, 2);
  if (educationBits.length > 0) {
    parts.push(`Education: ${educationBits.join("; ")}.`);
  }
  if (notes) {
    parts.push(`Recruiter notes: ${notes}`);
  }

  const text = collapseWhitespace(parts.join(" "));
  if (!text || text === "Professional profile.") {
    return skills.length > 0
      ? truncate(`${designation} with ${skills.join(", ")} experience.`, MAX_SEMANTIC_TEXT_CHARS)
      : "";
  }

  return truncate(text, MAX_SEMANTIC_TEXT_CHARS);
}

/** Fields on candidate update that should refresh the embedding. */
export const CANDIDATE_EMBEDDING_SOURCE_FIELDS = [
  "skills",
  "normalizedSkills",
  "currentDesignation",
  "positionRole",
  "totalExperience",
  "relevantExperience",
  "summary",
  "companies",
  "education",
  "certifications",
] as const;

export function candidateUpdateAffectsEmbedding(data: Record<string, unknown>): boolean {
  return CANDIDATE_EMBEDDING_SOURCE_FIELDS.some((key) => data[key] !== undefined);
}

/** Map API patch field names to embedding source fields. */
export function candidatePatchAffectsEmbedding(body: Record<string, unknown>): boolean {
  const normalized: Record<string, unknown> = {};

  if (body.skills !== undefined) normalized.skills = body.skills;
  if (body.normalizedSkills !== undefined) normalized.normalizedSkills = body.normalizedSkills;
  if (body.designation !== undefined) normalized.currentDesignation = body.designation;
  if (body.currentDesignation !== undefined) normalized.currentDesignation = body.currentDesignation;
  if (body.positionRole !== undefined) normalized.positionRole = body.positionRole;
  if (body.totalExperience !== undefined) normalized.totalExperience = body.totalExperience;
  if (body.experience !== undefined) normalized.totalExperience = body.experience;
  if (body.relevantExperience !== undefined) normalized.relevantExperience = body.relevantExperience;
  if (body.summary !== undefined) normalized.summary = body.summary;
  if (body.companies !== undefined) normalized.companies = body.companies;
  if (body.education !== undefined) normalized.education = body.education;
  if (body.certifications !== undefined) normalized.certifications = body.certifications;

  return candidateUpdateAffectsEmbedding(normalized);
}
