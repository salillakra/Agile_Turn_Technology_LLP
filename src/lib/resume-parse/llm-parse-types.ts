/** LLM parse response shape from POST /parse-resume/llm (Gemini). */

export type LlmWorkExperience = {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  ongoing: boolean;
  description: string | null;
};

export type LlmEducationEntry = {
  degree: string | null;
  institution: string | null;
  graduationYear: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type LlmParseResult = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  normalizedSkills: string[];
  workExperience: LlmWorkExperience[];
  education: LlmEducationEntry[];
  seniorityEstimate: string | null;
  confidence: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWorkExperience(value: unknown): value is LlmWorkExperience {
  if (!isRecord(value)) return false;
  return typeof value.company === "string" && typeof value.title === "string";
}

function isEducationEntry(value: unknown): value is LlmEducationEntry {
  return isRecord(value);
}

export function isLlmParseResult(value: unknown): value is LlmParseResult {
  if (!isRecord(value)) return false;
  if (value.name !== null && typeof value.name !== "string") return false;
  if (value.email !== null && typeof value.email !== "string") return false;
  if (value.phone !== null && typeof value.phone !== "string") return false;
  if (!Array.isArray(value.skills) || !value.skills.every((s) => typeof s === "string")) {
    return false;
  }
  if (
    !Array.isArray(value.normalizedSkills) ||
    !value.normalizedSkills.every((s) => typeof s === "string")
  ) {
    return false;
  }
  if (!Array.isArray(value.workExperience) || !value.workExperience.every(isWorkExperience)) {
    return false;
  }
  if (!Array.isArray(value.education) || !value.education.every(isEducationEntry)) {
    return false;
  }
  if (value.seniorityEstimate !== null && typeof value.seniorityEstimate !== "string") {
    return false;
  }
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence)) return false;
  return true;
}

export type ResumeParseStrategy = "RULE_BASED" | "LLM" | "HYBRID";

export type HybridParseMeta = {
  strategyUsed: ResumeParseStrategy;
  ruleConfidence: number;
  llmConfidence: number | null;
  disagreementFlags: string[];
  llmSkippedReason: string | null;
  sources: {
    rule: unknown;
    llm: LlmParseResult | null;
  };
};
