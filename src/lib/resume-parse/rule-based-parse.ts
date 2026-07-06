/**
 * Rule-based resume parse (Node, in-process).
 *
 * PDF: OpenResume algorithm (pdfjs-dist position-aware parsing)
 * @see https://www.open-resume.com/resume-parser
 *
 * DOCX/DOC/fallback: plain-text heuristics
 */

import { parseOpenResumeFromPdfBuffer, parseOpenResumeFromPdfPath } from "@/src/lib/open-resume";
import { mapOpenResumeToRuleParse } from "@/src/lib/resume-parse/open-resume-adapter";
import { buildResumeParseResultFromPlainText } from "@/src/lib/resume-parse-heuristic";
import type { LlmEducationEntry, LlmWorkExperience } from "@/src/lib/resume-parse/llm-parse-types";
import { RESUME_PARSE_LIMITS } from "@/src/lib/resume-parse-limits";
import { truncateSummaryWithFullStop } from "@/src/lib/text-terminal-punctuation";

export type RuleBasedParseResult = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  normalizedSkills: string[];
  experienceYears: number;
  summary: string;
  confidence: number;
  workExperience?: LlmWorkExperience[];
  education?: LlmEducationEntry[];
  parser: "open-resume" | "heuristic";
};

const EMAIL_RE =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g;

const SKILL_ALIASES: Record<string, string> = {
  reactjs: "React",
  "react.js": "React",
  react: "React",
  nodejs: "Node.js",
  "node.js": "Node.js",
  node: "Node.js",
  ts: "TypeScript",
  typescript: "TypeScript",
  js: "JavaScript",
  javascript: "JavaScript",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mongo: "MongoDB",
  mongodb: "MongoDB",
  aws: "AWS",
  gcp: "GCP",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
};

function extractEmail(text: string): string | null {
  const matches = text.match(EMAIL_RE);
  if (!matches?.length) return null;
  const preferred = matches.find((m) => !/example\.(com|org)/i.test(m) && !/noreply/i.test(m));
  return (preferred ?? matches[0] ?? null)?.toLowerCase() ?? null;
}

function extractPhone(text: string): string | null {
  const matches = text.match(PHONE_RE);
  if (!matches?.length) return null;
  for (const raw of matches) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      return raw.trim();
    }
  }
  return null;
}

function normalizeSkillToken(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (SKILL_ALIASES[key]) return SKILL_ALIASES[key];
  if (raw.length <= 4) return raw.toUpperCase() === raw ? raw : raw.trim();
  return raw.trim();
}

function dedupeNormalizedSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const norm = normalizeSkillToken(s);
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out.slice(0, RESUME_PARSE_LIMITS.MAX_SKILLS);
}

function computeHeuristicConfidence(params: {
  email: string | null;
  phone: string | null;
  name: string | null;
  skills: string[];
  experienceYears: number;
  textLength: number;
}): number {
  let score = 0;
  if (params.email) score += 0.25;
  if (params.phone) score += 0.2;
  if (params.name && params.name !== "Unknown") score += 0.2;
  if (params.skills.length >= 3) score += 0.2;
  else if (params.skills.length >= 1) score += 0.1;
  if (params.experienceYears > 0) score += 0.15;
  if (params.textLength >= 400) score += 0.05;
  return Math.min(1, Math.max(0, score));
}

function heuristicRuleParse(plainText: string, fallbackName: string): RuleBasedParseResult {
  const heuristic = buildResumeParseResultFromPlainText(plainText, fallbackName);
  const email = extractEmail(plainText);
  const phone = extractPhone(plainText);
  const name =
    heuristic.name && heuristic.name !== "Unknown" ? heuristic.name : fallbackName.trim() || null;
  const normalizedSkills = dedupeNormalizedSkills(heuristic.skills);
  const summary = truncateSummaryWithFullStop(
    heuristic.experience.summary,
    RESUME_PARSE_LIMITS.MAX_SUMMARY_LEN
  );

  return {
    name,
    email,
    phone,
    skills: heuristic.skills,
    normalizedSkills,
    experienceYears: heuristic.experience.years,
    summary,
    confidence: computeHeuristicConfidence({
      email,
      phone,
      name,
      skills: heuristic.skills,
      experienceYears: heuristic.experience.years,
      textLength: plainText.trim().length,
    }),
    parser: "heuristic",
  };
}

export type RuleBasedParseInput = {
  plainText: string;
  fallbackName: string;
  pdfPath?: string | null;
  pdfBuffer?: Buffer | null;
};

/**
 * Run local rule-based parse — OpenResume for PDF, heuristics otherwise.
 */
export async function ruleBasedParse(input: RuleBasedParseInput): Promise<RuleBasedParseResult> {
  const fallbackName = input.fallbackName.trim() || "Unknown";

  if (input.pdfPath) {
    try {
      const openResume = await parseOpenResumeFromPdfPath(input.pdfPath);
      return mapOpenResumeToRuleParse(openResume, fallbackName);
    } catch (e) {
      console.warn(
        "[rule-based-parse] OpenResume PDF parse failed (%s), falling back to heuristics",
        e instanceof Error ? e.message : String(e)
      );
    }
  } else if (input.pdfBuffer && input.pdfBuffer.length > 0) {
    try {
      const openResume = await parseOpenResumeFromPdfBuffer(input.pdfBuffer);
      return mapOpenResumeToRuleParse(openResume, fallbackName);
    } catch (e) {
      console.warn(
        "[rule-based-parse] OpenResume buffer parse failed (%s), falling back to heuristics",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  return heuristicRuleParse(input.plainText, fallbackName);
}

/** @deprecated Use async `ruleBasedParse(input)` */
export function ruleBasedParseSync(plainText: string, fallbackName: string): RuleBasedParseResult {
  return heuristicRuleParse(plainText, fallbackName);
}
