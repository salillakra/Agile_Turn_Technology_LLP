/**
 * In-process Gemini resume parse via @google/genai (Node worker / sync parse route).
 * @see https://googleapis.github.io/js-genai/release_docs/index.html
 */

import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_RESUME_PARSE_SYSTEM_INSTRUCTION,
  PARSED_RESUME_GEMINI_SCHEMA,
} from "@/src/lib/resume-parse/gemini-parse-schema";
import type { LlmParseResult } from "@/src/lib/resume-parse/llm-parse-types";
import { isLlmParseResult } from "@/src/lib/resume-parse/llm-parse-types";
import { sanitizeParsedName } from "@/src/lib/resume-parse/candidate-name-sanitize";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_CHARS = 14_000;

export function resolveGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    null;
  return key || null;
}

export function resolveGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function maxResumeChars(): number {
  const n = parseInt(process.env.GEMINI_RESUME_MAX_CHARS ?? String(DEFAULT_MAX_CHARS), 10);
  return Number.isFinite(n) && n > 500 ? n : DEFAULT_MAX_CHARS;
}

function truncateResumeText(text: string): string {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const max = maxResumeChars();
  if (cleaned.length <= max) return cleaned;
  const head = max - 120;
  return (
    cleaned.slice(0, head) +
    "\n\n[... truncated for LLM token budget ...]\n\n" +
    cleaned.slice(-80)
  );
}

function asStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizeWorkExperience(raw: unknown): LlmParseResult["workExperience"] {
  if (!Array.isArray(raw)) return [];
  const out: LlmParseResult["workExperience"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const company = typeof row.company === "string" ? row.company.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!company && !title) continue;
    out.push({
      company,
      title,
      startDate: asStringOrNull(row.startDate ?? row.start_date),
      endDate: asStringOrNull(row.endDate ?? row.end_date),
      ongoing: row.ongoing === true,
      description: asStringOrNull(row.description),
    });
  }
  return out;
}

function normalizeEducation(raw: unknown): LlmParseResult["education"] {
  if (!Array.isArray(raw)) return [];
  const out: LlmParseResult["education"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    out.push({
      degree: asStringOrNull(row.degree),
      institution: asStringOrNull(row.institution ?? row.college),
      graduationYear: asStringOrNull(row.graduationYear ?? row.graduation_year),
      startDate: asStringOrNull(row.startDate ?? row.start_date),
      endDate: asStringOrNull(row.endDate ?? row.end_date),
    });
  }
  return out;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

export function normalizeGeminiParsePayload(raw: unknown): LlmParseResult | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const confidenceRaw = row.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0;

  const normalized: LlmParseResult = {
    name: sanitizeParsedName(asStringOrNull(row.name)),
    email: asStringOrNull(row.email),
    phone: asStringOrNull(row.phone),
    skills: stringArray(row.skills),
    normalizedSkills: stringArray(row.normalizedSkills ?? row.normalized_skills),
    workExperience: normalizeWorkExperience(row.workExperience ?? row.work_experience),
    education: normalizeEducation(row.education),
    seniorityEstimate: asStringOrNull(row.seniorityEstimate ?? row.seniority_estimate),
    confidence,
  };

  return isLlmParseResult(normalized) ? normalized : null;
}

let clientInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not configured");
  }
  if (!clientInstance) {
    clientInstance = new GoogleGenAI({ apiKey });
  }
  return clientInstance;
}

export type GeminiLlmParseOutcome =
  | { ok: true; response: LlmParseResult }
  | { ok: false; error: string };

/**
 * Parse resume plain text with Gemini + schema-enforced JSON output.
 */
export async function parseResumeTextWithGemini(rawText: string): Promise<GeminiLlmParseOutcome> {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not configured" };
  }

  const resumeText = truncateResumeText(rawText);
  if (!resumeText) {
    return { ok: false, error: "Resume text is empty" };
  }

  const userPrompt = `Extract structured data from this resume text:\n\n${resumeText}`;

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: resolveGeminiModel(),
      contents: userPrompt,
      config: {
        systemInstruction: GEMINI_RESUME_PARSE_SYSTEM_INSTRUCTION,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: PARSED_RESUME_GEMINI_SCHEMA,
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

    const normalized = normalizeGeminiParsePayload(parsedJson);
    if (!normalized) {
      return { ok: false, error: "Gemini JSON does not match resume parse schema" };
    }

    return { ok: true, response: normalized };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Gemini LLM request failed: ${msg}` };
  }
}
