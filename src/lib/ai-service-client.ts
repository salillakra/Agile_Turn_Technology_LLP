import type { ParseResumeApiResponse } from "@/src/lib/structured-resume-parse";
import { isParseResumeApiResponse } from "@/src/lib/structured-resume-parse";
import {
  embedText,
  type EmbedTextResult,
  resolveAiServiceBaseUrl,
} from "@/src/lib/ai/embedding-client";

const DEFAULT_PARSE_TIMEOUT_MS = 120_000;

export { embedText };
export type { EmbedTextResult };

export function getConfiguredEmbeddingModel(): string {
  return process.env.AI_EMBEDDING_MODEL?.trim() || "all-MiniLM-L6-v2";
}

export type ParseResumeFileResult =
  | { ok: true; response: ParseResumeApiResponse }
  | { ok: false; error: string; status?: number };

/**
 * POST {AI_SERVICE_URL}/parse-resume — NLP structured parse from a PDF path on disk.
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
      return { ok: false, error: "AI parse-resume response does not match schema v8" };
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

export function isAiResumeParseConfigured(): boolean {
  const disabled = process.env.AI_RESUME_PARSE_ENABLED?.trim().toLowerCase();
  if (disabled === "0" || disabled === "false" || disabled === "off") {
    return false;
  }
  return Boolean(process.env.AI_SERVICE_URL?.trim());
}
