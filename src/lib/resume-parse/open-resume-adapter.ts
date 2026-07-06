/**
 * Maps OpenResume parse output → hybrid rule-based parse contract.
 */

import type { OpenResumeParse } from "@/src/lib/open-resume/resume-types";
import type { LlmEducationEntry, LlmWorkExperience } from "@/src/lib/resume-parse/llm-parse-types";
import { sanitizeParsedName } from "@/src/lib/resume-parse/candidate-name-sanitize";
import { RESUME_PARSE_LIMITS } from "@/src/lib/resume-parse-limits";
import { truncateSummaryWithFullStop } from "@/src/lib/text-terminal-punctuation";
import type { RuleBasedParseResult } from "@/src/lib/resume-parse/rule-based-parse";

const YEAR_RE = /(?:19|20)\d{2}/g;

function parseOpenResumeDate(dateStr: string): {
  startDate: string | null;
  endDate: string | null;
  ongoing: boolean;
} {
  const raw = dateStr.trim();
  if (!raw) return { startDate: null, endDate: null, ongoing: false };
  const ongoing = /\b(present|current|now)\b/i.test(raw);
  const years = [...raw.matchAll(YEAR_RE)].map((m) => m[0]);
  if (years.length === 0) return { startDate: null, endDate: null, ongoing };
  const startDate = years[0] ?? null;
  const endDate = ongoing ? null : years[years.length - 1] ?? null;
  return { startDate, endDate, ongoing };
}

function extractSkillsFromOpenResume(parsed: OpenResumeParse): string[] {
  const featured = parsed.skills.featuredSkills
    .map((s) => s.skill.trim())
    .filter(Boolean);
  const fromDesc = parsed.skills.descriptions
    .flatMap((d) => d.split(/[,;|•\n]+/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= RESUME_PARSE_LIMITS.MAX_SKILL_LEN);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...featured, ...fromDesc]) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= RESUME_PARSE_LIMITS.MAX_SKILLS) break;
  }
  return out;
}

function inferYearsFromWorkExperiences(work: LlmWorkExperience[]): number {
  const years = new Set<number>();
  for (const job of work) {
    const start = job.startDate ? parseInt(job.startDate.slice(0, 4), 10) : NaN;
    const end = job.ongoing
      ? new Date().getFullYear()
      : job.endDate
        ? parseInt(job.endDate.slice(0, 4), 10)
        : NaN;
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      for (let y = start; y <= end; y++) years.add(y);
    }
  }
  return years.size > 0 ? Math.min(60, years.size) : 0;
}

function mapWorkExperiences(parsed: OpenResumeParse): LlmWorkExperience[] {
  return parsed.workExperiences
    .filter((w) => w.company.trim() || w.jobTitle.trim())
    .map((w) => {
      const dates = parseOpenResumeDate(w.date);
      return {
        company: w.company.trim(),
        title: w.jobTitle.trim(),
        startDate: dates.startDate,
        endDate: dates.endDate,
        ongoing: dates.ongoing,
        description: w.descriptions.join(" ").trim() || null,
      };
    });
}

function mapEducation(parsed: OpenResumeParse): LlmEducationEntry[] {
  return parsed.educations
    .filter((e) => e.school.trim() || e.degree.trim())
    .map((e) => ({
      degree: e.degree.trim() || null,
      institution: e.school.trim() || null,
      graduationYear: (e.date.match(YEAR_RE)?.at(-1) ?? null) as string | null,
      startDate: null,
      endDate: null,
    }));
}

function computeOpenResumeConfidence(params: {
  profile: OpenResumeParse["profile"];
  skills: string[];
  workExperiences: LlmWorkExperience[];
  educations: LlmEducationEntry[];
}): number {
  let score = 0;
  if (params.profile.email?.trim()) score += 0.25;
  if (params.profile.phone?.trim()) score += 0.2;
  if (params.profile.name?.trim()) score += 0.2;
  if (params.skills.length >= 3) score += 0.15;
  else if (params.skills.length >= 1) score += 0.08;
  if (params.workExperiences.length > 0) score += 0.12;
  if (params.educations.length > 0) score += 0.08;
  return Math.min(1, Math.max(0, score));
}

export type OpenResumeRuleParseResult = RuleBasedParseResult & {
  workExperience: LlmWorkExperience[];
  education: LlmEducationEntry[];
  parser: "open-resume";
};

export function mapOpenResumeToRuleParse(
  parsed: OpenResumeParse,
  fallbackName: string
): OpenResumeRuleParseResult {
  const skills = extractSkillsFromOpenResume(parsed);
  const workExperience = mapWorkExperiences(parsed);
  const education = mapEducation(parsed);

  const name =
    sanitizeParsedName(parsed.profile.name) ||
    sanitizeParsedName(fallbackName) ||
    fallbackName.trim() ||
    null;
  const email = parsed.profile.email?.trim().toLowerCase() || null;
  const phone = parsed.profile.phone?.trim() || null;
  const summaryRaw =
    parsed.profile.summary?.trim() ||
    workExperience[0]?.description ||
    parsed.workExperiences[0]?.descriptions.join(" ") ||
    "";
  const summary = truncateSummaryWithFullStop(
    summaryRaw || "No summary extracted.",
    RESUME_PARSE_LIMITS.MAX_SUMMARY_LEN
  );

  const experienceYears = inferYearsFromWorkExperiences(workExperience);

  const confidence = computeOpenResumeConfidence({
    profile: parsed.profile,
    skills,
    workExperiences: workExperience,
    educations: education,
  });

  return {
    name,
    email,
    phone,
    skills,
    normalizedSkills: skills,
    experienceYears,
    summary,
    confidence,
    workExperience,
    education,
    parser: "open-resume",
  };
}
