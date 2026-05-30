import { buildCertificationRelevanceText } from "@/src/lib/ai/candidate-certification-relevance";
import { buildCandidateExperienceMatchText } from "@/src/lib/ai/candidate-experience-compatibility";
import type { CandidateFitSignalBundle } from "@/src/lib/ai/candidate-scoring-signals";
import type { CandidateScoringJobInput } from "@/src/lib/ai/candidate-scoring-signals";
import { deriveRecruiterSearchTheme } from "@/src/lib/ai/recruiter-search-explainability";
import {
  formatSkillPlusList,
  resolveSkillExplainability,
} from "@/src/lib/recommendation-explainability";
import type { RecommendationCandidateInput } from "@/src/lib/recommendation-engine";

export type CandidateRecommendationReasonsInput = {
  job: CandidateScoringJobInput;
  candidate: RecommendationCandidateInput;
  signals: CandidateFitSignalBundle;
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  skillRecencyScore?: number;
};

const MAX_REASONS = 8;

function pushUnique(reasons: string[], line: string): void {
  const t = line.trim();
  if (!t) return;
  if (reasons.some((r) => r.toLowerCase() === t.toLowerCase())) return;
  reasons.push(t.endsWith(".") ? t : `${t}.`);
}

function inferEngineeringTheme(
  job: CandidateScoringJobInput,
  matchedSkills: readonly string[]
): string {
  const query = [job.title, ...matchedSkills].filter(Boolean).join(" ");
  const tokens = matchedSkills.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return deriveRecruiterSearchTheme(query, tokens);
}

/**
 * Template-based explainability bullets for job→candidate recommendations (no LLM).
 *
 * @returns Ordered `recommendationReasons` — strongest signals first.
 */
export function buildCandidateRecommendationReasons(
  input: CandidateRecommendationReasonsInput
): string[] {
  const { job, candidate, signals } = input;
  const semanticScore = input.semanticScore;
  const skillScore = input.skillScore;
  const experienceScore = input.experienceScore;
  const skillRecencyScore = input.skillRecencyScore ?? signals.skillRecency.skillRecencyScore;

  const explain = resolveSkillExplainability(candidate, job);
  const matched = signals.skills.matchedSkills.length
    ? signals.skills.matchedSkills
    : explain.matchedSkills;
  const preferred = signals.skills.matchedPreferredSkills.length
    ? signals.skills.matchedPreferredSkills
    : explain.matchedPreferredSkills;
  const missing = signals.skills.missingSkills.length
    ? signals.skills.missingSkills
    : explain.missingSkills;

  const skillPhrase = formatSkillPlusList(matched, 4);
  const hasEmbeddings = signals.semanticAvailable;
  const reasons: string[] = [];

  if (skillScore >= 70 && matched.length >= 2 && skillPhrase) {
    if (skillScore >= 80) {
      pushUnique(reasons, `Strong ${skillPhrase} alignment`);
    } else {
      pushUnique(reasons, `Solid ${skillPhrase} alignment`);
    }
  } else if (skillScore >= 55 && skillPhrase) {
    pushUnique(reasons, `Required skill overlap includes ${skillPhrase}`);
  }

  if (hasEmbeddings && semanticScore >= 75) {
    pushUnique(reasons, "High semantic overlap with job requirements");
  } else if (hasEmbeddings && semanticScore >= 55) {
    pushUnique(reasons, "Good semantic overlap with job requirements");
  } else if (hasEmbeddings && semanticScore >= 35) {
    pushUnique(reasons, "Moderate semantic similarity to the role profile");
  }

  const theme = inferEngineeringTheme(job, matched);
  if (experienceScore >= 85 && theme) {
    pushUnique(reasons, `Excellent ${theme} experience`);
  } else if (experienceScore >= 70) {
    const expText = buildCandidateExperienceMatchText(signals.experience);
    if (signals.experience.meetsExperienceMinimum && theme) {
      pushUnique(reasons, `Strong ${theme} experience for this role`);
    } else if (signals.experience.meetsExperienceMinimum) {
      pushUnique(reasons, "Experience level meets the role requirement");
    } else if (expText && !expText.startsWith("Below")) {
      pushUnique(reasons, expText.replace(/\.$/, ""));
    }
  }

  if (preferred.length > 0) {
    const prefPhrase = formatSkillPlusList(preferred, 3);
    if (prefPhrase) {
      pushUnique(reasons, `Preferred skills matched: ${prefPhrase}`);
    }
  }

  const certText = buildCertificationRelevanceText(signals.certificationRelevance);
  if (certText && signals.certificationRelevance.matchedCertifications.length > 0) {
    pushUnique(reasons, certText.replace(/\.$/, ""));
  }

  if (skillRecencyScore >= 80 && signals.skillRecency.profileAgeDays != null) {
    pushUnique(reasons, "Recently updated profile with current skill signals");
  }

  if (signals.locationScore >= 100 && job.location?.trim()) {
    pushUnique(reasons, `Location preference aligns with ${job.location.trim()}`);
  }

  if (reasons.length === 0) {
    const title = job.title.trim() || "this role";
    if (skillPhrase) {
      pushUnique(reasons, `Some skill overlap (${skillPhrase}) for ${title}`);
    } else {
      pushUnique(reasons, `Review fit for ${title} manually`);
    }
  }

  if (missing.length > 0 && skillScore < 70) {
    pushUnique(
      reasons,
      `Gap to note: missing ${formatSkillPlusList(missing, 4) || missing.slice(0, 3).join(", ")}`
    );
  }

  return reasons.slice(0, MAX_REASONS);
}

/** Primary one-line summary (first bullet). */
export function buildPrimaryRecommendationReason(
  input: CandidateRecommendationReasonsInput
): string {
  const reasons = buildCandidateRecommendationReasons(input);
  return reasons[0] ?? "Review candidate fit for this role.";
}
