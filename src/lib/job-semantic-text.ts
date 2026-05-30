import {
  resolveJobSkillLists,
  resolveJobYearsOfExperience,
  type RecommendationJobInput,
} from "@/src/lib/recommendation-engine";
import { jobMetaPatchAffectsEmbedding } from "@/src/lib/embedding-refresh";

const MAX_DESCRIPTION_CHARS = 400;
const MAX_SEMANTIC_TEXT_CHARS = 2000;

export type JobSemanticTextInput = Pick<
  RecommendationJobInput,
  "title" | "yearsOfExperience" | "requiredSkills" | "preferredSkills" | "jobMeta"
> & {
  description?: string | null;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1).trim()}…`;
}

function joinSkills(skills: readonly string[]): string {
  return skills.filter(Boolean).join(", ");
}

/**
 * Combine structured job fields into one embeddable sentence block for the AI service.
 */
export function buildJobSemanticText(job: JobSemanticTextInput): string {
  const title = collapseWhitespace(job.title ?? "");
  if (!title) return "";

  const { requiredRaw, preferredRaw } = resolveJobSkillLists({
    id: "",
    title,
    location: "",
    yearsOfExperience: job.yearsOfExperience,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    jobMeta: job.jobMeta,
  });

  const years = resolveJobYearsOfExperience({
    id: "",
    title,
    location: "",
    yearsOfExperience: job.yearsOfExperience,
    jobMeta: job.jobMeta,
  });

  const descriptionRaw =
    typeof job.description === "string" ? stripHtml(job.description) : "";
  const description = descriptionRaw
    ? truncate(collapseWhitespace(descriptionRaw), MAX_DESCRIPTION_CHARS)
    : "";

  const parts: string[] = [`${title} role.`];
  if (description) {
    parts.push(description);
  }
  if (requiredRaw.length > 0) {
    parts.push(`Required skills: ${joinSkills(requiredRaw)}.`);
  }
  if (preferredRaw.length > 0) {
    parts.push(`Preferred skills: ${joinSkills(preferredRaw)}.`);
  }
  if (years != null && Number.isFinite(years) && years > 0) {
    parts.push(`Minimum experience: ${years} years.`);
  }

  return truncate(collapseWhitespace(parts.join(" ")), MAX_SEMANTIC_TEXT_CHARS);
}

/** Fields that change semantic meaning when updated. */
export const JOB_EMBEDDING_SOURCE_FIELDS = [
  "title",
  "description",
  "yearsOfExperience",
  "requiredSkills",
  "preferredSkills",
  "jobMeta",
] as const;

export function jobUpdateAffectsEmbedding(data: Record<string, unknown>): boolean {
  if (data.jobMeta !== undefined && typeof data.jobMeta === "object" && data.jobMeta !== null) {
    if (jobMetaPatchAffectsEmbedding(data.jobMeta as Record<string, unknown>)) {
      return true;
    }
  }
  return JOB_EMBEDDING_SOURCE_FIELDS.some(
    (key) => key !== "jobMeta" && data[key] !== undefined
  );
}
