import { Prisma } from "@prisma/client";
import type { ResumeEducationEntry, StructuredResumeParse } from "@/src/lib/structured-resume-parse";
import { isStructuredResumeParse } from "@/src/lib/structured-resume-parse";
import type { ResumeParseResult } from "@/src/lib/resume-parse-result";
import { RESUME_APPLY_LIMITS } from "@/src/lib/resume-parse-limits";
import { truncateSummaryWithFullStop } from "@/src/lib/text-terminal-punctuation";

const MAX_SUMMARY_LEN = RESUME_APPLY_LIMITS.MAX_SUMMARY_LEN;
const MAX_COMPANIES = 15;
const MAX_CERTIFICATIONS = 20;
const MAX_EDUCATION_ENTRIES = 8;
const MAX_COMPANY_LEN = 80;
const MAX_CERT_LEN = 100;
const MAX_DEGREE_LEN = 120;
const MAX_COLLEGE_LEN = 120;

export type StoredCandidateEducation = ResumeEducationEntry;

export type CandidateStructuredProfileUpdate = {
  summary: string | null;
  companies: string[];
  education: StoredCandidateEducation[] | null;
  certifications: string[];
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: readonly string[], maxItems: number, maxLen: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const t = collapseWhitespace(raw).slice(0, maxLen);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeProfileSummary(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = truncateSummaryWithFullStop(collapseWhitespace(value), MAX_SUMMARY_LEN);
  return t || null;
}

export function normalizeCompanyList(values: readonly string[] | undefined): string[] {
  return dedupeStrings(values ?? [], MAX_COMPANIES, MAX_COMPANY_LEN);
}

export function normalizeCertificationList(values: readonly string[] | undefined): string[] {
  return dedupeStrings(values ?? [], MAX_CERTIFICATIONS, MAX_CERT_LEN);
}

export function normalizeEducationEntries(
  entries: readonly ResumeEducationEntry[] | undefined
): StoredCandidateEducation[] | null {
  if (!entries?.length) return null;

  const out: StoredCandidateEducation[] = [];
  const seen = new Set<string>();

  for (const entry of entries.slice(0, MAX_EDUCATION_ENTRIES)) {
    const degree =
      typeof entry.degree === "string"
        ? collapseWhitespace(entry.degree).slice(0, MAX_DEGREE_LEN) || null
        : null;
    const college =
      typeof entry.college === "string"
        ? collapseWhitespace(entry.college).slice(0, MAX_COLLEGE_LEN) || null
        : null;
    const graduationYear =
      typeof entry.graduationYear === "number" &&
      Number.isInteger(entry.graduationYear) &&
      entry.graduationYear >= 1950 &&
      entry.graduationYear <= 2035
        ? entry.graduationYear
        : null;

    if (!degree && !college && graduationYear == null) continue;

    const key = `${(degree ?? "").toLowerCase()}|${(college ?? "").toLowerCase()}|${graduationYear ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ degree, college, graduationYear });
  }

  return out.length > 0 ? out : null;
}

/** Map ai-service structured parse → normalized Candidate columns. */
export function candidateStructuredProfileFromParse(
  parsed: StructuredResumeParse
): CandidateStructuredProfileUpdate {
  return {
    summary: normalizeProfileSummary(parsed.summary),
    companies: normalizeCompanyList(parsed.companies),
    education: normalizeEducationEntries(parsed.education),
    certifications: normalizeCertificationList(parsed.certifications),
  };
}

/** Legacy heuristic parse: summary from experience; empty structured lists. */
export function candidateStructuredProfileFromLegacyResult(
  result: ResumeParseResult
): CandidateStructuredProfileUpdate {
  return {
    summary: normalizeProfileSummary(result.experience.summary),
    companies: [],
    education: null,
    certifications: [],
  };
}

export function parseEducationJson(value: unknown): StoredCandidateEducation[] | null {
  if (!Array.isArray(value)) return null;
  const entries: StoredCandidateEducation[] = [];
  for (const item of value) {
    if (item == null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    entries.push({
      degree: typeof row.degree === "string" ? row.degree : null,
      college: typeof row.college === "string" ? row.college : null,
      graduationYear:
        typeof row.graduationYear === "number" ? row.graduationYear : null,
    });
  }
  return normalizeEducationEntries(entries);
}

export function educationToPrismaJson(
  education: StoredCandidateEducation[] | null
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (!education?.length) return Prisma.DbNull;
  return education as unknown as Prisma.InputJsonValue;
}

/** Read `ResumeParseJob.resultJson` when it includes embedded structured parse (v8). */
export function structuredProfileFromResultJson(
  resultJson: unknown
): CandidateStructuredProfileUpdate | null {
  if (!resultJson || typeof resultJson !== "object") return null;
  const record = resultJson as Record<string, unknown>;
  const embedded = record.structured;
  if (isStructuredResumeParse(embedded)) {
    return candidateStructuredProfileFromParse(embedded);
  }
  if (isStructuredResumeParse(record)) {
    return candidateStructuredProfileFromParse(record);
  }
  return null;
}
