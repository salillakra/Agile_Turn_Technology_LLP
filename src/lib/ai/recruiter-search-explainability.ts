import type { RecruiterHybridScoreComponents } from "@/src/lib/ai/recruiter-hybrid-ranking";
import type { RecruiterQueryIntent } from "@/src/lib/ai/recruiter-query-intent";
import {
  buildRecommendationReason,
  formatSkillPlusList,
} from "@/src/lib/recommendation-explainability";

/** Canonical token → recruiter-facing label. */
const SKILL_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  react: "React",
  aws: "AWS",
  typescript: "TypeScript",
  javascript: "JavaScript",
  nodejs: "Node.js",
  python: "Python",
  java: "Java",
  golang: "Go",
  kubernetes: "Kubernetes",
  docker: "Docker",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  graphql: "GraphQL",
  nextjs: "Next.js",
  vue: "Vue",
  angular: "Angular",
  azure: "Azure",
  gcp: "GCP",
};

export function displaySkillToken(token: string): string {
  const key = token.trim().toLowerCase();
  if (!key) return "";
  return SKILL_DISPLAY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function displaySkillTokens(tokens: readonly string[]): string[] {
  return tokens.map(displaySkillToken).filter(Boolean);
}

/**
 * Short theme phrase for semantic copy (e.g. "React frontend engineering").
 * Derived from query wording and matched skills — template-based, not an LLM.
 */
export function deriveRecruiterSearchTheme(
  query: string,
  matchedSkillTokens: readonly string[]
): string {
  const q = query.trim().toLowerCase();
  const labels = displaySkillTokens(matchedSkillTokens);

  const hasReact = matchedSkillTokens.includes("react") || /\breact\b/.test(q);
  const hasFrontend =
    /\bfrontend\b/.test(q) || /\bfront-end\b/.test(q) || /\bfront end\b/.test(q);
  const hasBackend = /\bbackend\b/.test(q) || /\bback-end\b/.test(q);
  const hasFullStack = /\bfull[- ]?stack\b/.test(q);
  const hasDevOps = /\bdevops\b/.test(q) || matchedSkillTokens.some((t) =>
    ["kubernetes", "docker", "terraform", "cicd"].includes(t)
  );
  const hasCloud =
    matchedSkillTokens.some((t) => ["aws", "azure", "gcp"].includes(t)) ||
    /\bcloud\b/.test(q);

  if (hasReact && hasFrontend) {
    return "React frontend engineering";
  }
  if (hasFullStack && labels.length >= 2) {
    return `${formatSkillPlusList(labels, 2)} full-stack engineering`;
  }
  if (hasBackend && labels.length >= 1) {
    return `${labels[0]} backend engineering`;
  }
  if (hasDevOps) {
    return labels.length > 0 ? `${formatSkillPlusList(labels, 2)} DevOps` : "DevOps engineering";
  }
  if (hasCloud && labels.length >= 1) {
    return `${formatSkillPlusList(labels, 2)} cloud engineering`;
  }
  if (labels.length >= 2) {
    return `${formatSkillPlusList(labels, 2)} engineering`;
  }
  if (labels.length === 1) {
    return `${labels[0]} engineering`;
  }

  const engineerMatch = q.match(
    /\b([\w\s-]{2,40}?)\s+(?:engineer|developer|architect|specialist)s?\b/i
  );
  if (engineerMatch?.[1]) {
    const phrase = engineerMatch[1].trim();
    if (phrase.length >= 2 && phrase.length <= 48) {
      return phrase;
    }
  }

  const trimmed = query.trim();
  if (trimmed.length <= 56) return trimmed;
  return `${trimmed.slice(0, 53).trim()}…`;
}

function buildSearchExperienceNote(
  hybrid: RecruiterHybridScoreComponents,
  intent: RecruiterQueryIntent
): string {
  const required = intent.minimumExperienceYears;
  if (required == null || required <= 0) return "";

  const candidateYears = hybrid.experience.candidateTotalExperience;
  if (candidateYears == null) {
    return `Experience not recorded; search requested ${required}+ years.`;
  }
  if (hybrid.experience.meetsExperienceMinimum) {
    if (hybrid.experience.experienceGapYears != null && hybrid.experience.experienceGapYears > 2) {
      return `Exceeds experience target (${candidateYears} years vs ${required} requested).`;
    }
    return `Meets experience target (${candidateYears} years vs ${required} requested).`;
  }
  return `Below experience target (${candidateYears} years vs ${required} requested).`;
}

function buildSearchLocationNote(
  hybrid: RecruiterHybridScoreComponents,
  intent: RecruiterQueryIntent,
  candidatePreferredLocation: string | null | undefined
): string {
  if (!intent.locationHint) return "";
  if (hybrid.locationScore >= 100) {
    const pref = candidatePreferredLocation?.trim();
    return pref
      ? `Location preference aligns with "${intent.locationHint}" (${pref}).`
      : `Profile fits location intent "${intent.locationHint}".`;
  }
  if (hybrid.locationScore <= 0 && candidatePreferredLocation) {
    return `Location preference (${candidatePreferredLocation}) may not match "${intent.locationHint}".`;
  }
  return "";
}

export type RecruiterSearchExplainabilityInput = {
  query: string;
  intent: RecruiterQueryIntent;
  hybrid: RecruiterHybridScoreComponents;
  candidateDesignation?: string | null;
  candidatePreferredLocation?: string | null;
};

/**
 * Primary recruiter-facing `recommendationReason` for semantic / hybrid search.
 *
 * Examples:
 * - "Strong semantic alignment for React frontend engineering."
 * - "Excellent AWS + TypeScript overlap."
 */
export function buildRecruiterSearchRecommendationReason(
  input: RecruiterSearchExplainabilityInput
): string {
  const { hybrid, intent } = input;
  const matchedDisplay = displaySkillTokens(hybrid.matchedSkills);
  const missingDisplay = displaySkillTokens(hybrid.missingSkills);
  const theme = deriveRecruiterSearchTheme(input.query, hybrid.matchedSkills);
  const skillPhrase = formatSkillPlusList(matchedDisplay, 4);

  const semanticStrong = hybrid.semanticScore >= 70;
  const semanticGood = hybrid.semanticScore >= 55;
  const skillExcellent =
    hybrid.skillScore >= 75 &&
    (matchedDisplay.length >= 2 || hybrid.matchedSkills.length >= 2);
  const skillGood = hybrid.skillScore >= 55 && skillPhrase.length > 0;

  let lead: string;

  if (skillExcellent && skillPhrase) {
    lead = `Excellent ${skillPhrase} overlap.`;
  } else if (semanticStrong) {
    const designation = input.candidateDesignation?.trim();
    if (designation && hybrid.semanticScore >= 78) {
      lead = `Strong semantic alignment for ${theme} (${designation}).`;
    } else {
      lead = `Strong semantic alignment for ${theme}.`;
    }
  } else if (skillGood && matchedDisplay.length >= 2) {
    lead = `Strong ${formatSkillPlusList(matchedDisplay, 3)} skill overlap for your search.`;
  } else if (semanticGood) {
    lead = skillPhrase
      ? `Good semantic alignment for ${theme} with ${skillPhrase} overlap.`
      : `Good semantic alignment for ${theme}.`;
  } else if (skillPhrase) {
    lead = `Skill overlap (${skillPhrase}) supports fit for ${theme}.`;
  } else if (hybrid.semanticScore >= 35) {
    lead = `Moderate semantic similarity to ${theme}; review profile details.`;
  } else {
    lead = `Limited overlap with ${theme}; consider manual review.`;
  }

  const experienceNote = buildSearchExperienceNote(hybrid, intent);
  const locationNote = buildSearchLocationNote(
    hybrid,
    intent,
    input.candidatePreferredLocation
  );

  const supplemental = [experienceNote, locationNote].filter(Boolean).join(" ");

  return buildRecommendationReason({
    semanticReason: lead,
    experienceMatch: supplemental,
    missingSkills: missingDisplay,
  });
}
