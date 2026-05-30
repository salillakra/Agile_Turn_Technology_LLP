import {
  matchJobSkills,
  resolveJobSkillLists,
  scoreExperienceMatch,
  type RecommendationCandidateInput,
  type RecommendationJobInput,
} from "@/src/lib/recommendation-engine";

export type RecommendationExplainabilityInput = {
  semanticScore: number;
  jobTitle: string;
  matchedSkills: readonly string[];
  matchedPreferredSkills?: readonly string[];
  /** When false, copy falls back to skill-overlap wording. */
  hasEmbeddings?: boolean;
};

function titleTheme(title: string): string {
  return title.trim().toLowerCase() || "this role";
}

function formatSkillList(skills: readonly string[]): string {
  const list = skills.map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0]!;
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  const head = list.slice(0, -1).join(", ");
  return `${head}, and ${list[list.length - 1]}`;
}

/** Recruiter-facing skill list with "+" (e.g. "TypeScript + Next.js"). */
export function formatSkillPlusList(skills: readonly string[], max = 4): string {
  const list = skills.map((s) => s.trim()).filter(Boolean).slice(0, max);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0]!;
  if (list.length === 2) return `${list[0]} + ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} + ${list[list.length - 1]}`;
}

function ecosystemPhrase(matchedSkills: readonly string[]): string {
  const formatted = formatSkillList(matchedSkills.slice(0, 4));
  if (!formatted) return "";
  const hasReactFamily = matchedSkills.some((s) => /react/i.test(s));
  if (hasReactFamily && matchedSkills.length >= 2) {
    return `${formatted} ecosystem`;
  }
  return formatted;
}

/**
 * Human-readable semantic explanation for recruiters (template-based, no LLM).
 */
export function buildSemanticReason(input: RecommendationExplainabilityInput): string {
  const theme = titleTheme(input.jobTitle);
  const skillsPart = ecosystemPhrase(input.matchedSkills);
  const hasEmbeddings = input.hasEmbeddings !== false;
  const score = input.semanticScore;

  if (hasEmbeddings && score >= 75) {
    if (skillsPart) {
      return `Strong semantic alignment for ${theme} and ${skillsPart}.`;
    }
    return `Strong semantic alignment for ${theme}.`;
  }

  if (hasEmbeddings && score >= 55) {
    if (skillsPart) {
      return `Good semantic alignment with ${theme} and overlapping skills (${skillsPart}).`;
    }
    return `Good semantic alignment with ${theme}.`;
  }

  if (hasEmbeddings && score >= 35) {
    if (skillsPart) {
      return `Moderate semantic similarity to ${theme}; some overlap on ${skillsPart}.`;
    }
    return `Moderate semantic similarity to ${theme}.`;
  }

  if (hasEmbeddings && score > 0) {
    return `Limited semantic similarity to ${theme}; explicit skill overlap carries more weight.`;
  }

  if (skillsPart) {
    return `Recommendation driven by skill overlap (${skillsPart})${hasEmbeddings ? "; semantic signal unavailable or weak" : ""}.`;
  }

  return `Insufficient skill and semantic overlap for ${theme}; review manually before applying.`;
}

/**
 * Short recruiter-facing headline for list UIs (e.g. "Excellent TypeScript + Next.js skill overlap").
 */
export function buildAiRecommendationHeadline(input: {
  jobTitle: string;
  semanticScore: number;
  skillScore?: number;
  matchedSkills: readonly string[];
}): string {
  const skills = input.matchedSkills.map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const score = input.semanticScore;
  const skillScore = input.skillScore ?? 0;
  const theme = titleTheme(input.jobTitle);
  const skillPhrase = formatSkillPlusList(skills, 3);

  if (skills.length >= 2 && skillScore >= 75) {
    return `Excellent ${skillPhrase} skill overlap`;
  }
  if (score >= 75) {
    return skills.length >= 2 ? `Strong ${skillPhrase} alignment` : `Strong semantic alignment for ${theme}`;
  }
  if (score >= 55) {
    return skills.length >= 2 ? `Good ${skillPhrase} overlap` : `Good semantic alignment for ${theme}`;
  }
  if (score >= 35) {
    return skills.length > 0 ? `Moderate ${skillPhrase} fit` : `Moderate fit for ${theme}`;
  }
  if (skills.length > 0) {
    return `Skill overlap on ${skillPhrase}`;
  }
  return `Review fit for ${theme}`;
}

export type HybridExplainabilityInput = {
  jobTitle: string;
  semanticScore: number;
  skillScore: number;
  matchedSkills: readonly string[];
  matchedPreferredSkills?: readonly string[];
  missingSkills?: readonly string[];
  hasEmbeddings?: boolean;
  experienceMatch?: string;
};

/**
 * Primary recruiter-facing `recommendationReason` for hybrid recommendations.
 *
 * Examples:
 * - "Strong semantic alignment for React Frontend Engineer."
 * - "Excellent TypeScript + Next.js skill overlap."
 */
export function buildHybridRecommendationReason(input: HybridExplainabilityInput): string {
  const title = input.jobTitle.trim() || "this role";
  const required = input.matchedSkills.map((s) => s.trim()).filter(Boolean);
  const preferred = (input.matchedPreferredSkills ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !required.some((r) => r.toLowerCase() === s.toLowerCase()));
  const highlightSkills =
    required.length > 0 ? required : preferred.length > 0 ? preferred : required;
  const skillPhrase = formatSkillPlusList(highlightSkills, 4);
  const hasEmbeddings = input.hasEmbeddings !== false;
  const semanticStrong = hasEmbeddings && input.semanticScore >= 70;
  const semanticGood = hasEmbeddings && input.semanticScore >= 55;
  const skillExcellent =
    input.skillScore >= 75 &&
    (required.length >= 2 || highlightSkills.length >= 2);
  const skillGood = input.skillScore >= 55 && skillPhrase.length > 0;

  let lead: string;

  if (skillExcellent && skillPhrase) {
    lead = `Excellent ${skillPhrase} skill overlap.`;
  } else if (semanticStrong) {
    lead = `Strong semantic alignment for ${title}.`;
  } else if (skillGood && required.length >= 2) {
    lead = `Strong ${formatSkillPlusList(required, 3)} skill overlap for ${title}.`;
  } else if (semanticGood) {
    lead = skillPhrase
      ? `Good semantic alignment for ${title} with ${skillPhrase} overlap.`
      : `Good semantic alignment for ${title}.`;
  } else if (skillPhrase) {
    lead = `Skill overlap (${skillPhrase}) supports fit for ${title}.`;
  } else {
    lead = buildSemanticReason({
      semanticScore: input.semanticScore,
      jobTitle: input.jobTitle,
      matchedSkills: input.matchedSkills,
      matchedPreferredSkills: input.matchedPreferredSkills,
      hasEmbeddings: input.hasEmbeddings,
    });
  }

  return buildRecommendationReason({
    semanticReason: lead,
    experienceMatch: input.experienceMatch ?? "",
    missingSkills: input.missingSkills,
  });
}

/**
 * Appends experience context and skill gaps after the primary lead sentence.
 */
export function buildRecommendationReason(params: {
  semanticReason: string;
  experienceMatch: string;
  missingSkills?: readonly string[];
}): string {
  const lead = params.semanticReason.trim();
  const parts: string[] = lead ? [lead] : [];

  const experience = params.experienceMatch.trim();
  if (
    experience &&
    experience !== "No minimum experience specified for this role." &&
    !lead.includes(experience)
  ) {
    parts.push(experience.endsWith(".") ? experience : `${experience}.`);
  }

  const gaps = (params.missingSkills ?? []).map((s) => s.trim()).filter(Boolean);
  if (gaps.length > 0) {
    parts.push(`Skill gaps: ${formatSkillList(gaps.slice(0, 5))}.`);
  }

  return parts.join(" ");
}

/**
 * Human-readable experience comparison for recruiters.
 */
export function buildExperienceMatchText(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): string {
  const exp = scoreExperienceMatch(candidate, job);

  if (exp.jobYearsOfExperience == null || exp.jobYearsOfExperience <= 0) {
    return "No minimum experience specified for this role.";
  }

  const required = exp.jobYearsOfExperience;
  const candidateYears = exp.candidateTotalExperience;

  if (candidateYears == null) {
    return `Experience not recorded on profile; role requires ${required}+ years.`;
  }

  if (exp.exceedsSignificantly) {
    return `Exceeds experience requirement (${candidateYears} years vs ${required} required).`;
  }

  if (exp.meetsMinimum) {
    return `Meets experience requirement (${candidateYears} years vs ${required} required).`;
  }

  return `Below experience requirement (${candidateYears} years vs ${required} required).`;
}

/** Skill match details used for explainability fields. */
export function resolveSkillExplainability(
  candidate: RecommendationCandidateInput,
  job: RecommendationJobInput
): {
  matchedSkills: string[];
  missingSkills: string[];
  matchedPreferredSkills: string[];
} {
  const { requiredRaw, preferredRaw } = resolveJobSkillLists(job);
  const skillMatch = matchJobSkills(candidate, requiredRaw, preferredRaw);
  return {
    matchedSkills: skillMatch.matchedSkills,
    missingSkills: skillMatch.missingSkills,
    matchedPreferredSkills: skillMatch.matchedPreferredSkills,
  };
}
