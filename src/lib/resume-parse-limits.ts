/**
 * Shared résumé parse / apply field limits.
 * Keep ai-service `skill_extraction` / `resume_summary_builder` in sync where noted.
 */
export const RESUME_PARSE_LIMITS = {
  MAX_SKILLS: 50,
  MAX_SKILL_LEN: 150,
  MAX_SUMMARY_LEN: 1200,
} as const;

export const RESUME_APPLY_LIMITS = {
  MAX_SKILLS: 60,
  MAX_SKILL_LEN: 300,
  MAX_NAME_LEN: 200,
  MAX_SUMMARY_LEN: 1200,
} as const;
