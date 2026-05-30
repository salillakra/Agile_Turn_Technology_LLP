import type { ResumeParseResult } from "@/src/lib/resume-parse-result";
import {
  isStructuredResumeParse,
  type StructuredResumeParse,
} from "@/src/lib/structured-resume-parse";

/** UI-facing review form seeded from `ResumeParseJob.resultJson` (schema v10). */
export type ResumeParseReviewForm = {
  resumeParseJobId: string;
  name: string;
  skills: string[];
  normalizedSkills: string[];
  totalExperience: number;
  currentDesignation: string | null;
  summary: string;
  companies: string[];
  education: Array<{
    degree: string | null;
    college: string | null;
    graduationYear: number | null;
  }>;
  certifications: string[];
  skillsConfidence: number;
  experienceConfidence: number;
  educationConfidence: number;
};

function confidenceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export function confidenceLabelForScore(score: number): "high" | "medium" | "low" {
  if (!Number.isFinite(score)) return "low";
  return confidenceLabel(Math.max(0, Math.min(1, score)));
}

/**
 * Build editable review defaults from completed parse `resultJson`.
 * Prefer embedded `structured` (ai-service); fall back to legacy `experience` + `skills`.
 */
export function buildResumeParseReviewForm(
  resumeParseJobId: string,
  resultJson: unknown
): ResumeParseReviewForm | null {
  if (!resultJson || typeof resultJson !== "object") return null;
  const record = resultJson as Record<string, unknown>;

  const legacy = record as Partial<ResumeParseResult>;
  const structured: StructuredResumeParse | null = isStructuredResumeParse(record.structured)
    ? record.structured
    : isStructuredResumeParse(record)
      ? record
      : null;

  const name = typeof legacy.name === "string" ? legacy.name : "";
  const skills =
    structured?.skills?.length
      ? structured.skills
      : Array.isArray(legacy.skills)
        ? legacy.skills.filter((s): s is string => typeof s === "string")
        : [];

  const normalizedSkills = structured?.normalizedSkills ?? [];
  const totalExperience =
    structured?.totalExperience ??
    (typeof legacy.experience?.years === "number" ? legacy.experience.years : 0);

  const summary =
    structured?.summary?.trim() ||
    (typeof legacy.experience?.summary === "string" ? legacy.experience.summary : "");

  return {
    resumeParseJobId,
    name,
    skills,
    normalizedSkills,
    totalExperience,
    currentDesignation: structured?.currentDesignation ?? null,
    summary,
    companies: structured?.companies ?? [],
    education: structured?.education ?? [],
    certifications: structured?.certifications ?? [],
    skillsConfidence: structured?.skillsConfidence ?? 0,
    experienceConfidence: structured?.experienceConfidence ?? 0,
    educationConfidence: structured?.educationConfidence ?? 0,
  };
}

/** Payload for POST .../resume/parse/apply after recruiter edits. */
export function reviewFormToApplyBody(form: ResumeParseReviewForm): {
  resumeParseJobId: string;
  result: ResumeParseResult;
  structured: StructuredResumeParse;
} {
  const structured: StructuredResumeParse = {
    schemaVersion: 10,
    skills: form.skills,
    normalizedSkills: form.normalizedSkills,
    companies: form.companies,
    currentDesignation: form.currentDesignation,
    education: form.education,
    certifications: form.certifications,
    totalExperience: form.totalExperience,
    summary: form.summary,
    skillsConfidence: form.skillsConfidence,
    experienceConfidence: form.experienceConfidence,
    educationConfidence: form.educationConfidence,
  };

  return {
    resumeParseJobId: form.resumeParseJobId,
    result: {
      name: form.name,
      skills: form.skills,
      experience: {
        years: form.totalExperience,
        summary: form.summary,
      },
      structured,
    },
    structured,
  };
}
