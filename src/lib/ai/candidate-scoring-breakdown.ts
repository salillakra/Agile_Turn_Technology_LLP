import { buildCertificationRelevanceText } from "@/src/lib/ai/candidate-certification-relevance";
import type { AiConfidenceResult } from "@/src/lib/ai/candidate-ai-confidence";
import type { HybridCandidateFitContribution } from "@/src/lib/ai/candidate-scoring-weights";
import type { CandidateFitSignalBundle } from "@/src/lib/ai/candidate-scoring-signals";
import type { RecommendationCandidateInput } from "@/src/lib/recommendation-engine";
import type { CandidateScoringJobInput } from "@/src/lib/ai/candidate-scoring-signals";

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export type CandidateFitScoreFactorId =
  | "semantic"
  | "skill"
  | "experience"
  | "skillRecency"
  | "resumeQuality"
  | "certifications"
  | "location";

export type CandidateFitScoreFactor = {
  id: CandidateFitScoreFactorId;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  available: boolean;
};

export type CandidateFitScoreBreakdown = {
  factors: CandidateFitScoreFactor[];
  matchedSkills: string[];
  missingSkills: string[];
  semanticAvailable: boolean;
  cosineSimilarity: number | null;
  semanticSource: "pgvector" | "in_memory" | "unavailable";
  locationScore: number;
  skillRecencyScore: number;
  weightsProfile: "full" | "without_semantic";
  fitExplanation: string;
  fitExplanationDetail: string[];
};

function mapContributions(contributions: HybridCandidateFitContribution[]): CandidateFitScoreFactor[] {
  return contributions.map((c) => ({
    id: c.id as CandidateFitScoreFactorId,
    label: c.label,
    score: c.score,
    weight: c.weight,
    contribution: c.contribution,
    available: c.available,
  }));
}

export function buildCandidateFitScoreBreakdown(params: {
  job: CandidateScoringJobInput;
  candidate: RecommendationCandidateInput;
  signals: CandidateFitSignalBundle;
  candidateFitScore: number;
  contributions: HybridCandidateFitContribution[];
  weightsProfile: "full" | "without_semantic";
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  skillRecencyScore: number;
  aiConfidence: AiConfidenceResult;
  recommendationReasons: readonly string[];
}): CandidateFitScoreBreakdown {
  const { job, signals, semanticScore, skillScore, experienceScore, skillRecencyScore, aiConfidence } =
    params;
  const { semanticAvailable } = signals;

  const factors = mapContributions(params.contributions);
  const fitExplanation =
    params.recommendationReasons[0] ??
    "Review candidate fit for this role.";

  const cosine = signals.semantic.cosineSimilarity;
  const certText = buildCertificationRelevanceText(signals.certificationRelevance);

  const fitExplanationDetail: string[] = [
    `Candidate fit score: ${params.candidateFitScore}/100 (hybrid formula, ${params.weightsProfile.replace("_", " ")} weights).`,
    ...params.recommendationReasons.map((r) => `• ${r}`),
    ...factors
      .filter((f) => f.available && f.weight > 0)
      .map(
        (f) =>
          `${f.label}: ${f.score}/100 (weight ${Math.round(f.weight * 100)}%, contributes ~${f.contribution}).`
      ),
    `AI confidence: ${aiConfidence.confidenceScore} (parsing ${aiConfidence.resumeParsingQuality}, embeddings ${aiConfidence.embeddingQuality}, completeness ${aiConfidence.dataCompleteness}).`,
  ];

  if (cosine != null && semanticAvailable) {
    fitExplanationDetail.push(
      `Normalized cosine similarity: ${roundScore(cosine * 1000) / 10}% (source: ${signals.semantic.source}).`
    );
  }

  if (signals.skills.missingSkills.length > 0) {
    fitExplanationDetail.push(
      `Missing required skills: ${signals.skills.missingSkills.slice(0, 6).join(", ")}${
        signals.skills.missingSkills.length > 6 ? "…" : ""
      }.`
    );
  }

  fitExplanationDetail.push(`Required skill coverage: ${signals.skills.requiredMatchPercent}%.`);

  if (signals.skillRecency.profileAgeDays != null) {
    fitExplanationDetail.push(
      `Skill recency: ${skillRecencyScore}/100 (profile updated ${signals.skillRecency.profileAgeDays} day(s) ago).`
    );
  } else {
    fitExplanationDetail.push(`Skill recency: ${skillRecencyScore}/100.`);
  }

  if (certText && !params.recommendationReasons.some((r) => r.includes("certification"))) {
    fitExplanationDetail.push(certText);
  }

  if (!semanticAvailable) {
    fitExplanationDetail.push(
      "Semantic similarity unavailable — its 30% weight redistributed across other factors."
    );
  }

  return {
    factors,
    matchedSkills: [...signals.skills.matchedSkills],
    missingSkills: [...signals.skills.missingSkills],
    semanticAvailable,
    cosineSimilarity: cosine,
    semanticSource: signals.semantic.source,
    locationScore: signals.locationScore,
    skillRecencyScore,
    weightsProfile: params.weightsProfile,
    fitExplanation,
    fitExplanationDetail,
  };
}
