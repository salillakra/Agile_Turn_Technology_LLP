import type { ParseResumeApiResponse } from "@/src/lib/structured-resume-parse";
import { isParseResumeApiResponse } from "@/src/lib/structured-resume-parse";
import {
  isLlmParseResult,
  type LlmParseResult,
} from "@/src/lib/resume-parse/llm-parse-types";
import {
  isLlmCircuitOpen,
  recordLlmFailure,
  recordLlmSuccess,
} from "@/src/lib/resume-parse/llm-circuit-breaker";
import {
  parseResumeTextWithGemini,
  resolveGeminiApiKey,
} from "@/src/lib/resume-parse/gemini-llm-parse";
import {
  embedText,
  type EmbedTextResult,
  resolveAiServiceBaseUrl,
} from "@/src/lib/ai/embedding-client";

const DEFAULT_PARSE_TIMEOUT_MS = 120_000;
const DEFAULT_LLM_PARSE_TIMEOUT_MS = 45_000;

export { embedText };
export type { EmbedTextResult };

export function getConfiguredEmbeddingModel(): string {
  return process.env.AI_EMBEDDING_MODEL?.trim() || "all-MiniLM-L6-v2";
}

export type ParseResumeFileResult =
  | { ok: true; response: ParseResumeApiResponse }
  | { ok: false; error: string; status?: number };

export type ParseResumeLlmTextResult =
  | { ok: true; response: LlmParseResult }
  | { ok: false; error: string; status?: number; circuitOpen?: boolean };

/**
 * POST {AI_SERVICE_URL}/parse-resume — legacy spaCy NLP parse from PDF path.
 */
export async function parseResumePdfFile(filePath: string): Promise<ParseResumeFileResult> {
  const url = `${resolveAiServiceBaseUrl()}/parse-resume`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_PARSE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
      signal: controller.signal,
    });

    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const record = body as { message?: string; detail?: string } | null;
      const msg =
        (record && typeof record.message === "string" && record.message) ||
        (record && typeof record.detail === "string" && record.detail) ||
        `AI parse-resume failed (${res.status})`;
      return { ok: false, error: msg, status: res.status };
    }

    if (!isParseResumeApiResponse(body)) {
      return { ok: false, error: "AI parse-resume response does not match schema v10" };
    }

    return { ok: true, response: body };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "AI parse-resume request timed out"
          : e.message
        : "AI parse-resume request failed";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Gemini structured parse — primary: @google/genai in Node; fallback: ai-service sidecar.
 */
export async function parseResumeTextWithLlm(text: string): Promise<ParseResumeLlmTextResult> {
  if (isLlmCircuitOpen()) {
    return { ok: false, error: "LLM circuit breaker open", circuitOpen: true };
  }

  if (resolveGeminiApiKey()) {
    const gemini = await parseResumeTextWithGemini(text);
    if (!gemini.ok) {
      recordLlmFailure();
      const errGemini = gemini as { ok: false; error: string };
      return { ok: false, error: errGemini.error };
    }
    recordLlmSuccess();
    return { ok: true, response: gemini.response };
  }

  const useSidecar =
    process.env.AI_RESUME_LLM_USE_AI_SERVICE?.trim().toLowerCase() === "1" ||
    process.env.AI_RESUME_LLM_USE_AI_SERVICE?.trim().toLowerCase() === "true";

  if (!useSidecar || !process.env.AI_SERVICE_URL?.trim()) {
    return {
      ok: false,
      error: "GEMINI_API_KEY is not configured (set GEMINI_API_KEY or GOOGLE_API_KEY in .env)",
    };
  }

  const url = `${resolveAiServiceBaseUrl()}/parse-resume/llm`;
  const timeoutMs = parseInt(
    process.env.AI_RESUME_LLM_TIMEOUT_MS ?? String(DEFAULT_LLM_PARSE_TIMEOUT_MS),
    10
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      recordLlmFailure();
      const record = body as { message?: string; detail?: string } | null;
      const msg =
        (record && typeof record.message === "string" && record.message) ||
        (record && typeof record.detail === "string" && record.detail) ||
        `AI parse-resume/llm failed (${res.status})`;
      return { ok: false, error: msg, status: res.status };
    }

    if (!isLlmParseResult(body)) {
      recordLlmFailure();
      return { ok: false, error: "AI parse-resume/llm response does not match schema" };
    }

    recordLlmSuccess();
    return { ok: true, response: body };
  } catch (e) {
    recordLlmFailure();
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "AI parse-resume/llm request timed out"
          : e.message
        : "AI parse-resume/llm request failed";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

/** Legacy spaCy PDF parse — kept for backwards compatibility. */
export function isAiResumeParseConfigured(): boolean {
  const disabled = process.env.AI_RESUME_PARSE_ENABLED?.trim().toLowerCase();
  if (disabled === "0" || disabled === "false" || disabled === "off") {
    return false;
  }
  return Boolean(process.env.AI_SERVICE_URL?.trim());
}

/** Hybrid Gemini LLM parse (@google/genai in Node, or ai-service sidecar fallback). */
export function isAiResumeLlmParseConfigured(): boolean {
  const disabled = process.env.AI_RESUME_LLM_ENABLED?.trim().toLowerCase();
  if (disabled === "0" || disabled === "false" || disabled === "off") {
    return false;
  }
  if (resolveGeminiApiKey()) {
    return true;
  }
  const useSidecar =
    process.env.AI_RESUME_LLM_USE_AI_SERVICE?.trim().toLowerCase() === "1" ||
    process.env.AI_RESUME_LLM_USE_AI_SERVICE?.trim().toLowerCase() === "true";
  return useSidecar && Boolean(process.env.AI_SERVICE_URL?.trim());
}

