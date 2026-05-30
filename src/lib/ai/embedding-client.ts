const DEFAULT_AI_SERVICE_URL = "http://127.0.0.1:8000";
const DEFAULT_EMBED_TIMEOUT_MS = 30_000;

export type EmbedTextResult =
  | { ok: true; embedding: number[] }
  | { ok: false; error: string; status?: number };

export type EmbeddingClientOptions = {
  /** Base URL for the AI service (no trailing slash). Defaults to env or localhost. */
  baseUrl?: string;
  /** Override timeout (ms). Defaults to 30s. */
  timeoutMs?: number;
};

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export function resolveAiServiceBaseUrl(options?: EmbeddingClientOptions): string {
  const explicit = options?.baseUrl?.trim();
  if (explicit) return normalizeBaseUrl(explicit);
  const fromEnv = process.env.AI_SERVICE_URL?.trim();
  return fromEnv && fromEnv.length > 0
    ? normalizeBaseUrl(fromEnv)
    : DEFAULT_AI_SERVICE_URL;
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * POST {AI_SERVICE_URL}/embed — returns embedding vector from the FastAPI AI service.
 */
export async function embedText(
  text: string,
  options: EmbeddingClientOptions = {}
): Promise<EmbedTextResult> {
  const baseUrl = resolveAiServiceBaseUrl(options);
  const url = `${baseUrl}/embed`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_EMBED_TIMEOUT_MS
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => null)) as
      | { embedding?: unknown; message?: string; detail?: string }
      | null;

    if (!res.ok) {
      const msg =
        (body && typeof body.message === "string" && body.message) ||
        (body && typeof body.detail === "string" && body.detail) ||
        `AI embed failed (${res.status})`;
      return { ok: false, error: msg, status: res.status };
    }

    if (!body || !isFiniteNumberArray(body.embedding)) {
      return { ok: false, error: "AI embed response missing embedding array" };
    }

    return { ok: true, embedding: body.embedding };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "AI embed request timed out"
          : e.message
        : "AI embed request failed";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

