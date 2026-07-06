/** Shared jobMeta resume-match configuration for eligibility APIs. */

export type JobResumeMatchConfig = {
  /** Explicit threshold from jobMeta (null when unset). */
  threshold: number | null;
  requiredSkills: string[];
  /**
   * Threshold used for scoring. When the job lists required skills but no threshold,
   * falls back to DEFAULT_RESUME_MATCH_THRESHOLD so mismatched roles are not auto-eligible.
   */
  effectiveThreshold: number | null;
};

function readDefaultThreshold(): number {
  const raw = process.env.DEFAULT_RESUME_MATCH_THRESHOLD?.trim();
  const parsed = raw ? Number(raw) : 60;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

export function parseJobResumeMatchMeta(jobMeta: unknown): JobResumeMatchConfig {
  const obj =
    jobMeta != null && typeof jobMeta === "object" && !Array.isArray(jobMeta)
      ? (jobMeta as Record<string, unknown>)
      : null;
  const thresholdRaw = obj?.resumeMatchThreshold;
  const threshold =
    thresholdRaw === null || thresholdRaw === undefined || thresholdRaw === ""
      ? null
      : Number(thresholdRaw);
  const requiredSkillsRaw = obj?.requiredSkills;
  const requiredSkills = Array.isArray(requiredSkillsRaw)
    ? requiredSkillsRaw
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  const explicitThreshold =
    threshold != null && Number.isFinite(threshold) && threshold > 0 ? threshold : null;

  let effectiveThreshold: number | null = null;
  if (requiredSkills.length > 0) {
    effectiveThreshold = explicitThreshold ?? readDefaultThreshold();
  } else if (explicitThreshold != null) {
    effectiveThreshold = explicitThreshold;
  }

  return {
    threshold: explicitThreshold,
    requiredSkills,
    effectiveThreshold,
  };
}
