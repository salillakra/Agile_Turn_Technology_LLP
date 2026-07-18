/**
 * JD pipeline: buffer → extract (mammoth/pdf-parse) → clean → Gemini JSON → create-shaped body.
 * Skill canonicalization happens in createJobFromBody via normalizeSkills.
 */

import { GoogleGenAI } from "@google/genai";
import { extractPlainTextFromResumeBuffer } from "@/src/lib/resume-extract-text";
import {
  validateResumeFile,
  type AllowedResumeExt,
} from "@/src/lib/resume-upload-validation";
import {
  resolveGeminiApiKey,
  resolveGeminiModel,
} from "@/src/lib/resume-parse/gemini-llm-parse";
import { JOB_FIELD_LIMITS } from "@/src/lib/job-validation";
import { cleanJdText } from "@/src/lib/job-parse/clean-jd-text";
import {
  GEMINI_JOB_PARSE_SYSTEM_INSTRUCTION,
  PARSED_JOB_GEMINI_SCHEMA,
} from "@/src/lib/job-parse/gemini-job-parse-schema";

const DEFAULT_MAX_CHARS = 14_000;

export type ParsedJobLlm = {
  title: string | null;
  department: string | null;
  location: string | null;
  employmentType: "FULL_TIME" | "CONTRACT" | "INTERNSHIP" | null;
  roleSummary: string | null;
  keyResponsibilities: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  experienceRequired: string | null;
  minimumExperienceYears: number | null;
  education: string | null;
  confidence: number;
};

export type JobParseDraftBody = {
  title: string;
  department: string;
  location: string;
  employmentType: string;
  roleSummary: string;
  keyResponsibilities: string;
  requiredSkills: string[];
  preferredSkills: string[];
  experienceRequired: string;
  minimumExperienceYears: number | null;
  education: string | null;
  description: string | null;
  numberOfOpenings: number;
  status: "OPEN";
};

export type ParseJobDescriptionResult =
  | {
      ok: true;
      textChars: number;
      confidence: number;
      parsed: ParsedJobLlm;
      body: JobParseDraftBody;
      missingFields: string[];
    }
  | { ok: false; error: string; code?: string };

function maxJdChars(): number {
  const n = parseInt(process.env.GEMINI_JOB_MAX_CHARS ?? String(DEFAULT_MAX_CHARS), 10);
  return Number.isFinite(n) && n > 500 ? n : DEFAULT_MAX_CHARS;
}

function truncateJdText(text: string): string {
  const max = maxJdChars();
  if (text.length <= max) return text;
  const head = max - 120;
  return (
    text.slice(0, head) +
    "\n\n[... truncated for LLM token budget ...]\n\n" +
    text.slice(-80)
  );
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function clip(s: string | null, max: number): string | null {
  if (s == null) return null;
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function normalizeEmploymentType(
  raw: unknown
): ParsedJobLlm["employmentType"] {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (s === "FULL_TIME" || s === "FULLTIME") return "FULL_TIME";
  if (s === "CONTRACT" || s === "CONTRACTOR") return "CONTRACT";
  if (s === "INTERNSHIP" || s === "INTERN") return "INTERNSHIP";
  return null;
}

function normalizeMinimumYears(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < 0 || n > 50) return null;
  return n;
}

/** Pure mapper — used by self-check without Gemini. */
export function normalizeJobLlmPayload(raw: unknown): ParsedJobLlm | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const confidenceRaw = row.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0;

  return {
    title: clip(asStringOrNull(row.title), JOB_FIELD_LIMITS.title),
    department: clip(asStringOrNull(row.department), JOB_FIELD_LIMITS.department),
    location: clip(asStringOrNull(row.location), JOB_FIELD_LIMITS.location),
    employmentType: normalizeEmploymentType(row.employmentType),
    roleSummary: clip(asStringOrNull(row.roleSummary), JOB_FIELD_LIMITS.roleSummary),
    keyResponsibilities: clip(
      asStringOrNull(row.keyResponsibilities),
      JOB_FIELD_LIMITS.keyResponsibilities
    ),
    requiredSkills: stringArray(row.requiredSkills).map((s) =>
      s.slice(0, JOB_FIELD_LIMITS.skillsItem)
    ),
    preferredSkills: stringArray(row.preferredSkills).map((s) =>
      s.slice(0, JOB_FIELD_LIMITS.skillsItem)
    ),
    experienceRequired: clip(
      asStringOrNull(row.experienceRequired),
      JOB_FIELD_LIMITS.experienceRequired
    ),
    minimumExperienceYears: normalizeMinimumYears(row.minimumExperienceYears),
    education: clip(asStringOrNull(row.education), JOB_FIELD_LIMITS.education),
    confidence,
  };
}

/** Map LLM parse → createJobFromBody-shaped draft (empty strings when unknown). */
export function parsedJobToCreateBody(parsed: ParsedJobLlm): JobParseDraftBody {
  const roleSummary = parsed.roleSummary?.trim() ?? "";
  return {
    title: parsed.title?.trim() ?? "",
    department: parsed.department?.trim() ?? "",
    location: parsed.location?.trim() ?? "",
    employmentType: parsed.employmentType ?? "",
    roleSummary,
    keyResponsibilities: parsed.keyResponsibilities?.trim() ?? "",
    requiredSkills: parsed.requiredSkills,
    preferredSkills: parsed.preferredSkills,
    experienceRequired: parsed.experienceRequired?.trim() ?? "",
    minimumExperienceYears: parsed.minimumExperienceYears,
    education: parsed.education,
    description: roleSummary || null,
    numberOfOpenings: 1,
    status: "OPEN",
  };
}

export function missingCreateFields(body: JobParseDraftBody): string[] {
  const missing: string[] = [];
  if (!body.title) missing.push("title");
  if (!body.department) missing.push("department");
  if (!body.location) missing.push("location");
  if (!body.employmentType) missing.push("employmentType");
  if (!body.roleSummary) missing.push("roleSummary");
  if (!body.keyResponsibilities) missing.push("keyResponsibilities");
  if (!body.requiredSkills.length) missing.push("requiredSkills");
  if (!body.experienceRequired) missing.push("experienceRequired");
  if (body.minimumExperienceYears == null) missing.push("minimumExperienceYears");
  return missing;
}

async function parseJobTextWithGemini(
  cleanedText: string
): Promise<{ ok: true; parsed: ParsedJobLlm } | { ok: false; error: string }> {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not configured" };
  }

  const jdText = truncateJdText(cleanedText);
  if (!jdText) {
    return { ok: false, error: "Job description text is empty after cleaning" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: resolveGeminiModel(),
      contents: `Extract structured job fields from this job description text:\n\n${jdText}`,
      config: {
        systemInstruction: GEMINI_JOB_PARSE_SYSTEM_INSTRUCTION,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: PARSED_JOB_GEMINI_SCHEMA,
      },
    });

    const text = response.text?.trim() ?? "";
    if (!text) {
      return { ok: false, error: "Gemini returned empty response" };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      return { ok: false, error: "Gemini response is not valid JSON" };
    }

    const parsed = normalizeJobLlmPayload(parsedJson);
    if (!parsed) {
      return { ok: false, error: "Gemini JSON does not match job parse schema" };
    }
    return { ok: true, parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Gemini LLM request failed: ${msg}` };
  }
}

/**
 * Full JD parse from an uploaded file buffer.
 * Reuses resume extract (pdf-parse / mammoth / word-extractor).
 */
export async function parseJobDescriptionFromBuffer(params: {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ParseJobDescriptionResult> {
  const validated = validateResumeFile({
    originalName: params.originalName,
    mimeType: params.mimeType,
    buffer: params.buffer,
  });
  if (!validated.ok) {
    return { ok: false, error: validated.message, code: validated.code };
  }

  const extracted = await extractPlainTextFromResumeBuffer(
    params.buffer,
    validated.ext as AllowedResumeExt
  );
  if (!extracted.ok) {
    return { ok: false, error: `Text extraction failed: ${extracted.error}`, code: "EXTRACT_FAILED" };
  }

  const cleaned = cleanJdText(extracted.text);
  if (!cleaned) {
    return { ok: false, error: "No readable text found in file", code: "EMPTY_TEXT" };
  }

  const llm = await parseJobTextWithGemini(cleaned);
  if (!llm.ok) {
    return { ok: false, error: llm.error, code: "LLM_FAILED" };
  }

  const body = parsedJobToCreateBody(llm.parsed);
  return {
    ok: true,
    textChars: cleaned.length,
    confidence: llm.parsed.confidence,
    parsed: llm.parsed,
    body,
    missingFields: missingCreateFields(body),
  };
}
