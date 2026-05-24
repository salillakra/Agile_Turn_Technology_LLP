import type { ResumeParseResult } from "@/src/lib/resume-parse-result";
import { scrubContactInfo } from "@/src/lib/pii-scrub";

/**
 * Derives structured fields from raw plain text using heuristics (section headers, regex).
 * Replace or augment with LLM/rules later; output always matches `ResumeParseResult`.
 */
export function buildResumeParseResultFromPlainText(
  plainText: string,
  fallbackName: string
): ResumeParseResult {
  const text = plainText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const years = inferYearsOfExperience(text);

  let name = inferCandidateName(text, lines, fallbackName.trim() || "Unknown");

  const skills = extractSkills(text, lines);
  let summary = buildSummary(text, lines);
  summary = scrubContactInfo(summary);
  if (summary.length < 20 && lines.length > 0) {
    summary = scrubContactInfo(normalizeWs(lines.slice(0, 5).join(" "))).slice(0, 500);
  }

  return {
    name,
    skills: skills.length > 0 ? skills : ["(none detected — edit in review)"],
    experience: {
      years,
      summary: summary || "No summary extracted.",
    },
  };
}

function inferCandidateName(fullText: string, lines: string[], fallback: string): string {
  const nameLineMatch = fullText.match(/(?:^|\n)\s*(?:name|full name)\s*[:.]?\s*([^\n|]+)/i);
  if (nameLineMatch?.[1]) {
    const n = nameLineMatch[1].trim().split(/[,;]/)[0].trim();
    if (n.length >= 2 && n.length < 100 && !/@/.test(n)) return n;
  }
  const first = lines[0] ?? "";
  if (first.includes("|")) {
    const head = first.split("|")[0].trim();
    if (head.length >= 3 && head.length < 90 && /[a-zA-Z]/.test(head) && !/\d{10}/.test(head)) {
      return head;
    }
  }
  const words = first.split(/\s+/).filter(Boolean);
  if (
    words.length >= 2 &&
    words.length <= 6 &&
    first.length < 100 &&
    !/@/.test(first) &&
    !/^\d{10}/.test(first) &&
    !/[|]/.test(first)
  ) {
    return firstLineLooksLikeName(first) ? first : fallback;
  }
  return fallback;
}

function firstLineLooksLikeName(s: string): boolean {
  if (/[|@]/.test(s)) return false;
  if (/\d{5,}/.test(s)) return false;
  return true;
}

function inferYearsOfExperience(fullText: string): number {
  const t = fullText.replace(/\s+/g, " ");
  const explicit = t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?\.?)(?:\s+of)?(?:\s+experience|\s+exp)?/i);
  if (explicit) {
    const n = parseFloat(explicit[1]);
    if (Number.isFinite(n)) return Math.min(60, Math.max(0, Math.round(n)));
  }
  const months = t.match(/(\d+)\s*\+?\s*(?:months?|mos?\.?)/i);
  if (months) {
    const m = parseInt(months[1], 10);
    if (Number.isFinite(m)) return Math.min(60, Math.max(0, Math.round(m / 12)));
  }
  return 0;
}

const MAX_SKILLS = 24;
const MAX_SKILL_LEN = 72;

function stripCategoryPrefix(s: string): string {
  // Common category prefixes seen in resumes: "Programming", "Frameworks/Libraries", etc.
  return s
    .replace(
      /^(core\s+ai\/ml|frameworks\/libraries|programming|languages?|tools?|backend\s*&\s*deployment|data\/visualization|core\s+competencies|technical\s+skills?|key\s+skills?)\s+/i,
      ""
    )
    .trim();
}

/**
 * PDF extractors often glue tokens (e.g. "AI/MLMachine Learning", "learningNLP").
 * Insert spaces at likely word boundaries so comma-splitting and prefix stripping work.
 */
function insertSkillWordBoundaries(s: string): string {
  let t = s.trim();
  if (!t) return t;
  // Acronym run (2+ caps) then a capitalized word (e.g. AI/MLMachine Learning -> split at ML|Machine after ML is separated — MLMachine handled here).
  t = t.replace(/(?<=[A-Z]{2,})(?=[A-Z][a-z])/g, " ");
  // Word run ending in lowercase then TitleCase (e.g. learningNLP). Avoids splitting "iOS" (no lowercase-before-O pattern with [A-Z][a-z] after).
  t = t.replace(/(?<=[a-z]{2,})(?=[A-Z][a-z])/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** PDFs often emit multiple list items on one line separated by bullets/dashes. */
function expandInlineListDelimiters(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(
    // Space + bullet/dot/asterisk + space (repeatable inline bullets).
    /\s+[\u2022\u2023\u2043\u2219\u25AA\u25CF\u25CB\u25E6\u00B7\u2024\u2027\u25B8\u25BA\u27A2\u2219•·▪▸►‣⁃*]+\s+/g,
    ", "
  ).replace(
    // Spaced hyphen / en/em dash between tokens (risky for ranges; skills lines rarely use "2019-2020" mid-line).
    /\s+[–—-]\s+(?=(?:[\p{L}\p{N}]|\())/gu,
    ", "
  );
}

/** Strip leading list markers from a single line (numbered, bullets, checked boxes). */
function stripLeadingListMarker(line: string): string {
  return line.replace(
    /^(?:\[[ xX]?\]|\(?\d{1,2}[.)]\s*|(?:[\u2022\u2023\u2043\u2219\u25AA\u25CF\u25CB\u25E6\u00B7•·▪▸►‣⁃*]|[–—-])\s*)+/,
    ""
  ).trim();
}

function splitSkillSegment(segment: string): string[] {
  const withInlineDelims = expandInlineListDelimiters(
    insertSkillWordBoundaries(segment.replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
  );
  // Be robust to different comma/bullet codepoints from PDF extraction.
  const parts = withInlineDelims.split(
    /[,;\uFF0C\u201A|•·\u2022\u00B7\u25CF\u25E6\u2219\u2043\n\r]+/
  );
  const out: string[] = [];
  for (const p of parts) {
    const cleaned = stripCategoryPrefix(insertSkillWordBoundaries(p));
    if (cleaned) out.push(cleaned);
  }
  // If PDF extraction produced a single long line that still contains commas,
  // split again on commas as a fallback.
  if (out.length === 1 && /[,;\uFF0C]/.test(out[0] ?? "")) {
    return out[0]!
      .split(/[,;\uFF0C\u201A]+/)
      .map((x) => stripCategoryPrefix(insertSkillWordBoundaries(x)))
      .filter(Boolean);
  }
  return out;
}

/** Split the skills block into lines and parse each (so every bullet row contributes). */
function splitSegmentIntoSkillFragments(segment: string): string[] {
  const lines = segment
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((l) => stripLeadingListMarker(l.trim()))
    .filter((l) => l.length > 0);

  const fragments: string[] = [];
  for (const line of lines) {
    fragments.push(...splitSkillSegment(line));
  }
  return fragments;
}

function buildSummary(fullText: string, lines: string[]): string {
  const cleaned = fullText.replace(/\r/g, "\n");
  const blockPatterns = [
    /(?:^|\n)\s*(?:PROFESSIONAL\s+)?SUMMARY\s*[:.]?\s*\n([\s\S]{0,1500})/i,
    /(?:^|\n)\s*PROJECTS?\s*[:.]?\s*\n([\s\S]{0,1500})/i,
    /(?:^|\n)\s*EXPERIENCE\s*[:.]?\s*\n([\s\S]{0,1500})/i,
  ];
  for (const re of blockPatterns) {
    const m = cleaned.match(re);
    if (m?.[1]) {
      const firstBlock = m[1].split(/\n{2,}|(?=EDUCATION|SKILLS|CERTIFICATION|ACHIEVEMENT)/i)[0] ?? m[1];
      const s = scrubContactInfo(normalizeWs(firstBlock).trim());
      if (s.length > 50) return s.slice(0, 500);
    }
  }
  let start = 0;
  if (lines[0] && /[|@]|\+91[-\d\s]{8,}/.test(lines[0])) {
    start = 1;
  }
  const body = lines.slice(start).join(" ");
  let s = normalizeWs(body);
  s = s.replace(/\b\+?\d[\d\s\-]{8,}\d\b/g, " ").replace(/\S+@\S+\.\S+/g, " ");
  s = scrubContactInfo(normalizeWs(s));
  return s.slice(0, 500);
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** End of skills section: must be start of a line so words like "Teamwork" do not match `(?=WORK)`. */
const SKILLS_SECTION_END =
  /\n(?:\s*)(?=(?:PROFESSIONAL\s+)?(?:EXPERIENCE|(?:WORK|EMPLOYMENT)(?:\s+(?:EXPERIENCE|HISTORY))?|EDUCATION|ACADEM(?:IC|ICS)?|PROJECTS?|INTERNSHIP|VOLUNTEER|(?:KEY\s+)?ACHIEVEMENTS?|POSITION\s+OF|CERTIFICATIONS?|(?:RELEVANT\s+)?COURSEWORK|PUBLICATIONS?|AWARDS?|REFERENCE)\b)/i;

function extractSkills(fullText: string, lines: string[]): string[] {
  const upper = fullText.toUpperCase();
  const skillIdx = upper.indexOf("SKILL");
  const out: string[] = [];
  if (skillIdx !== -1) {
    const chunk = fullText.slice(skillIdx, skillIdx + 12000);
    const afterHeader = chunk.replace(/^[\s\S]*?SKILLS?\s*/i, "");
    const segment = (afterHeader.split(SKILLS_SECTION_END)[0] ?? afterHeader).trim();
    const parts = splitSegmentIntoSkillFragments(segment);
    for (const p of parts) {
      const s = normalizeSkillFragment(p);
      if (isPlausibleSkill(s)) {
        out.push(s);
        if (out.length >= MAX_SKILLS) break;
      }
    }
  }
  if (out.length > 0) return dedupeSkills(out);
  const commaLine = lines.find((l) => /skill/i.test(l) && /[,;]/.test(l));
  if (commaLine) {
    for (const p of commaLine.split(/[,;]/)) {
      const s = normalizeSkillFragment(p.replace(/^.*?:\s*/, ""));
      if (isPlausibleSkill(s)) {
        out.push(s);
        if (out.length >= MAX_SKILLS) break;
      }
    }
  }
  return dedupeSkills(out);
}

function normalizeSkillFragment(raw: string): string {
  return insertSkillWordBoundaries(raw)
    .replace(/^[-–—•\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SKILL_LEN);
}

function isPlausibleSkill(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > MAX_SKILL_LEN) return false;
  if (/https?:\/\/|@\S+\.\S+|linkedin\.com|github\.com/i.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  if (/^(st|nd|rd|th)$/i.test(t)) return false;
  if (/\b(leetcode|gfg|coursera|fest|cultural|comedy|improv|asia|prize|award|solved\d|challengeson|platforms like|competitive programming|industry-recognized|certifications?:)/i.test(t)) {
    return false;
  }
  const wordCount = t.split(/\s+/).length;
  if (wordCount > 7) return false;
  if (/[.!?]/.test(t) && t.length > 50) return false;
  return true;
}

function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(0, MAX_SKILLS);
}
