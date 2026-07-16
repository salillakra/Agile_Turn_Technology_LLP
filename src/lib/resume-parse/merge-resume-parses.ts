import type { LlmParseResult } from "@/src/lib/resume-parse/llm-parse-types";
import type { RuleBasedParseResult } from "@/src/lib/resume-parse/rule-based-parse";
import type { StructuredResumeParse } from "@/src/lib/structured-resume-parse";
import { STRUCTURED_RESUME_PARSE_SCHEMA_VERSION } from "@/src/lib/structured-resume-parse";
import { RESUME_PARSE_LIMITS } from "@/src/lib/resume-parse-limits";
import { truncateSummaryWithFullStop } from "@/src/lib/text-terminal-punctuation";
import { resolveParsedCandidateName } from "@/src/lib/resume-parse/candidate-name-sanitize";

export type MergedHybridParse = {
  name: string;
  email: string | null;
  phone: string | null;
  skills: string[];
  normalizedSkills: string[];
  experienceYears: number;
  summary: string;
  workExperience: LlmParseResult["workExperience"];
  education: LlmParseResult["education"];
  seniorityEstimate: string | null;
  companies: string[];
  currentDesignation: string | null;
  structured: StructuredResumeParse;
  disagreementFlags: string[];
};

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

function unionSkills(rule: RuleBasedParseResult, llm: LlmParseResult | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const s of rule.skills) add(s);
  if (llm) {
    for (const s of llm.skills) add(s);
  }
  return out.slice(0, RESUME_PARSE_LIMITS.MAX_SKILLS);
}

function mergeNormalizedSkills(rule: RuleBasedParseResult, llm: LlmParseResult | null): string[] {
  const map = new Map<string, string>();
  for (const s of rule.normalizedSkills) {
    map.set(s.toLowerCase(), s);
  }
  if (llm) {
    for (const s of llm.normalizedSkills) {
      map.set(s.toLowerCase(), s);
    }
  }
  return [...map.values()].slice(0, RESUME_PARSE_LIMITS.MAX_SKILLS);
}

function inferYearsFromWorkExp(work: LlmParseResult["workExperience"]): number {
  if (!work.length) return 0;
  const years = new Set<number>();
  for (const job of work) {
    const start = job.startDate?.slice(0, 4);
    const end = job.ongoing ? String(new Date().getFullYear()) : job.endDate?.slice(0, 4);
    const sy = start ? parseInt(start, 10) : NaN;
    const ey = end ? parseInt(end, 10) : NaN;
    if (Number.isFinite(sy) && Number.isFinite(ey) && ey >= sy) {
      for (let y = sy; y <= ey; y++) years.add(y);
    }
  }
  return years.size > 0 ? Math.min(60, years.size) : 0;
}

function computeDisagreementFlags(
  rule: RuleBasedParseResult,
  llm: LlmParseResult | null
): string[] {
  if (!llm) return [];
  const flags: string[] = [];
  const ruleEmail = normalizeEmail(rule.email);
  const llmEmail = normalizeEmail(llm.email);
  if (ruleEmail && llmEmail && ruleEmail !== llmEmail) {
    flags.push("email_mismatch");
  }
  const rulePhone = normalizePhone(rule.phone);
  const llmPhone = normalizePhone(llm.phone);
  if (rulePhone && llmPhone && rulePhone !== llmPhone) {
    flags.push("phone_mismatch");
  }
  const skillDelta = Math.abs(rule.skills.length - llm.skills.length);
  if (skillDelta >= 8) {
    flags.push("skill_count_delta");
  }
  if (
    rule.name &&
    llm.name &&
    rule.name.toLowerCase() !== llm.name.toLowerCase() &&
    !rule.name.toLowerCase().includes(llm.name.toLowerCase()) &&
    !llm.name.toLowerCase().includes(rule.name.toLowerCase())
  ) {
    flags.push("name_mismatch");
  }
  return flags;
}

function buildStructuredFromMerged(merged: Omit<MergedHybridParse, "structured" | "disagreementFlags">): StructuredResumeParse {
  return {
    schemaVersion: STRUCTURED_RESUME_PARSE_SCHEMA_VERSION,
    skills: merged.skills,
    normalizedSkills: merged.normalizedSkills,
    companies: merged.companies,
    currentDesignation: merged.currentDesignation,
    education: merged.education.map((e) => ({
      degree: e.degree,
      college: e.institution,
      graduationYear: e.graduationYear ? parseInt(e.graduationYear, 10) || null : null,
    })),
    certifications: [],
    totalExperience: merged.experienceYears,
    summary: merged.summary,
    skillsConfidence: 0.85,
    experienceConfidence: merged.workExperience.length > 0 ? 0.8 : 0.4,
    educationConfidence: merged.education.length > 0 ? 0.75 : 0.3,
  };
}

/**
 * Merge rule + LLM parses per hybrid policy:
 * - email/phone → rule
 * - name → LLM when present and plausible (section headers like "About Me" rejected)
 * - skills → union; normalizedSkills LLM wins on conflict
 * - work/education → LLM
 */
export function mergeResumeParses(
  rule: RuleBasedParseResult,
  llm: LlmParseResult | null,
  fallbackName: string
): MergedHybridParse {
  const disagreementFlags = computeDisagreementFlags(rule, llm);

  const name = resolveParsedCandidateName({
    llmName: llm?.name,
    ruleName: rule.name,
    fallbackName,
  });
  const email = rule.email;
  const phone = rule.phone;
  const skills = unionSkills(rule, llm);
  const normalizedSkills = mergeNormalizedSkills(rule, llm);
  const workExperience =
    llm?.workExperience ??
    (rule.workExperience && rule.workExperience.length > 0 ? rule.workExperience : []);
  const education =
    llm?.education ?? (rule.education && rule.education.length > 0 ? rule.education : []);
  const seniorityEstimate = llm?.seniorityEstimate ?? null;

  const companies = [
    ...new Set(workExperience.map((w) => w.company.trim()).filter(Boolean)),
  ].slice(0, 20);

  const currentDesignation =
    workExperience.find((w) => w.ongoing)?.title ??
    workExperience[0]?.title ??
    null;

  const llmYears = inferYearsFromWorkExp(workExperience);
  const experienceYears =
    llmYears > 0 ? llmYears : rule.experienceYears;

  let summary = rule.summary;
  if (llm && workExperience.length > 0) {
    const latest = workExperience[0];
    const snippet = [latest.title, latest.company].filter(Boolean).join(" at ");
    if (snippet && summary.length < 80) {
      summary = truncateSummaryWithFullStop(
        `${snippet}. ${summary}`.trim(),
        RESUME_PARSE_LIMITS.MAX_SUMMARY_LEN
      );
    }
  }

  const base = {
    name,
    email,
    phone,
    skills,
    normalizedSkills,
    experienceYears,
    summary,
    workExperience,
    education,
    seniorityEstimate,
    companies,
    currentDesignation,
  };

  return {
    ...base,
    structured: buildStructuredFromMerged(base),
    disagreementFlags,
  };
}
