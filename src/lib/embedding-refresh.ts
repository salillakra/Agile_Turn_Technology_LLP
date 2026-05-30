import { getConfiguredEmbeddingModel } from "@/src/lib/ai-service-client";
import type { StoredEmbeddingRecord } from "@/src/lib/vector-similarity";

export type EmbeddingRefreshReason =
  | "job_created"
  | "job_updated"
  | "candidate_profile_updated"
  | "candidate_skills_updated"
  | "resume_parse_applied"
  | "resume_replaced"
  | "manual";

export type ParsedStoredEmbedding = {
  semanticText: string | null;
  model: string | null;
};

/** Parse persisted `Job.embedding` / `Candidate.embedding` JSON. */
export function parseStoredEmbedding(stored: unknown): ParsedStoredEmbedding {
  if (stored == null || typeof stored !== "object" || Array.isArray(stored)) {
    return { semanticText: null, model: null };
  }
  const record = stored as StoredEmbeddingRecord;
  const semanticText =
    typeof record.semanticText === "string" && record.semanticText.trim()
      ? record.semanticText.trim()
      : null;
  const model =
    typeof record.model === "string" && record.model.trim() ? record.model.trim() : null;
  return { semanticText, model };
}

/**
 * Whether the AI `/embed` call should run for this semantic text.
 * Skips when stored text + model already match (avoids unnecessary recomputation).
 */
export function embeddingNeedsRefresh(params: {
  stored: unknown;
  semanticText: string;
  model?: string;
  force?: boolean;
}): boolean {
  if (params.force) return true;
  const text = params.semanticText.trim();
  if (!text) return false;

  const expectedModel = params.model ?? getConfiguredEmbeddingModel();
  const parsed = parseStoredEmbedding(params.stored);

  if (!parsed.semanticText || !parsed.model) return true;
  if (parsed.model !== expectedModel) return true;
  return parsed.semanticText !== text;
}

/** Keys inside `jobMeta` that change embeddable job text. */
export const JOB_META_EMBEDDING_KEYS = [
  "requiredSkills",
  "preferredSkills",
  "roleSummary",
  "keyResponsibilities",
  "experienceRequired",
  "minimumExperienceYears",
] as const;

export function jobMetaPatchAffectsEmbedding(meta: Record<string, unknown>): boolean {
  return JOB_META_EMBEDDING_KEYS.some((key) => meta[key] !== undefined);
}
