import type { InterviewRecommendation } from "@prisma/client";

/** Numeric score used to average panel recommendations (deterministic, no AI). */
export const INTERVIEW_RECOMMENDATION_SCORE: Record<InterviewRecommendation, number> = {
  STRONG_HIRE: 2,
  HIRE: 1,
  NEUTRAL: 0,
  NO_HIRE: -1,
  STRONG_NO_HIRE: -2,
};

const ALL_RECOMMENDATIONS: InterviewRecommendation[] = [
  "STRONG_HIRE",
  "HIRE",
  "NEUTRAL",
  "NO_HIRE",
  "STRONG_NO_HIRE",
];

export type InterviewFeedbackAggregationInput = {
  reviewerId: string;
  reviewerName: string | null;
  rating: number | null;
  recommendation: InterviewRecommendation;
  strengths: string | null;
  weaknesses: string | null;
  notes: string | null;
};

export type InterviewDecisionConfidence = "high" | "medium" | "low" | "insufficient";

export type AggregatedInterviewDecision = {
  feedbackCount: number;
  interviewerCount: number;
  pendingFeedbackCount: number;
  averageRating: number | null;
  ratingCount: number;
  recommendationVotes: Record<InterviewRecommendation, number>;
  /** Mean of {@link INTERVIEW_RECOMMENDATION_SCORE} across submissions. */
  recommendationScoreAverage: number | null;
  overallRecommendation: InterviewRecommendation | null;
  confidence: InterviewDecisionConfidence;
  feedbackSummary: {
    strengths: string[];
    weaknesses: string[];
    notes: string[];
  };
  reviewerSummaries: Array<{
    reviewerId: string;
    reviewerName: string | null;
    rating: number | null;
    recommendation: InterviewRecommendation;
    strengths: string | null;
    weaknesses: string | null;
  }>;
  /** Human-readable, rule-based rationale (not AI-generated). */
  rationale: string[];
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyVoteCounts(): Record<InterviewRecommendation, number> {
  return {
    STRONG_HIRE: 0,
    HIRE: 0,
    NEUTRAL: 0,
    NO_HIRE: 0,
    STRONG_NO_HIRE: 0,
  };
}

/** Split freeform text into distinct bullet lines for summary aggregation. */
export function splitFeedbackBulletLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n|•|·|;/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/** Deduplicate lines preserving first-seen order (case-insensitive key). */
export function uniqueFeedbackLines(lines: readonly string[], maxItems = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function recommendationScoreToEnum(avgScore: number): InterviewRecommendation {
  if (avgScore >= 1.25) return "STRONG_HIRE";
  if (avgScore >= 0.25) return "HIRE";
  if (avgScore <= -1.25) return "STRONG_NO_HIRE";
  if (avgScore <= -0.25) return "NO_HIRE";
  return "NEUTRAL";
}

function applyRatingGuardrails(
  recommendation: InterviewRecommendation,
  averageRating: number | null
): InterviewRecommendation {
  if (averageRating == null) return recommendation;

  if (averageRating < 2.5) {
    if (recommendation === "STRONG_HIRE" || recommendation === "HIRE") {
      return averageRating < 2 ? "NO_HIRE" : "NEUTRAL";
    }
  }

  if (averageRating >= 4.5) {
    if (recommendation === "NO_HIRE" || recommendation === "STRONG_NO_HIRE") {
      return "NEUTRAL";
    }
    if (recommendation === "HIRE") {
      return "STRONG_HIRE";
    }
  }

  return recommendation;
}

function pickPluralityRecommendation(
  votes: Record<InterviewRecommendation, number>
): { winner: InterviewRecommendation | null; share: number } {
  let winner: InterviewRecommendation | null = null;
  let maxVotes = 0;
  let total = 0;

  for (const key of ALL_RECOMMENDATIONS) {
    const count = votes[key];
    total += count;
    if (count > maxVotes) {
      maxVotes = count;
      winner = key;
    }
  }

  if (!winner || total === 0) {
    return { winner: null, share: 0 };
  }

  return { winner, share: maxVotes / total };
}

function resolveConfidence(params: {
  feedbackCount: number;
  interviewerCount: number;
  pluralityShare: number;
  ratingSpread: number | null;
}): InterviewDecisionConfidence {
  if (params.feedbackCount === 0) return "insufficient";
  if (params.feedbackCount < Math.max(1, Math.ceil(params.interviewerCount * 0.5))) {
    return "low";
  }
  if (params.pluralityShare >= 0.75) {
    return params.ratingSpread != null && params.ratingSpread > 2 ? "medium" : "high";
  }
  if (params.pluralityShare >= 0.5) {
    return "medium";
  }
  return "low";
}

function computeRatingSpread(ratings: number[]): number | null {
  if (ratings.length < 2) return null;
  return Math.max(...ratings) - Math.min(...ratings);
}

/**
 * Aggregate panel feedback into a single overall recommendation (rule-based).
 */
export function aggregateInterviewDecision(params: {
  feedback: readonly InterviewFeedbackAggregationInput[];
  interviewerCount: number;
}): AggregatedInterviewDecision {
  const feedback = params.feedback;
  const interviewerCount = Math.max(0, params.interviewerCount);
  const feedbackCount = feedback.length;
  const pendingFeedbackCount = Math.max(0, interviewerCount - feedbackCount);

  const recommendationVotes = emptyVoteCounts();
  const ratings: number[] = [];
  const strengthLines: string[] = [];
  const weaknessLines: string[] = [];
  const noteLines: string[] = [];
  let recommendationScoreSum = 0;

  for (const row of feedback) {
    recommendationVotes[row.recommendation] += 1;
    recommendationScoreSum += INTERVIEW_RECOMMENDATION_SCORE[row.recommendation];
    if (row.rating != null && Number.isFinite(row.rating)) {
      ratings.push(row.rating);
    }
    strengthLines.push(...splitFeedbackBulletLines(row.strengths));
    weaknessLines.push(...splitFeedbackBulletLines(row.weaknesses));
    noteLines.push(...splitFeedbackBulletLines(row.notes));
  }

  const ratingCount = ratings.length;
  const averageRating =
    ratingCount > 0 ? round1(ratings.reduce((a, b) => a + b, 0) / ratingCount) : null;
  const recommendationScoreAverage =
    feedbackCount > 0 ? round1(recommendationScoreSum / feedbackCount) : null;

  const { winner: pluralityWinner, share: pluralityShare } = pickPluralityRecommendation(
    recommendationVotes
  );

  let overallRecommendation: InterviewRecommendation | null = null;
  const rationale: string[] = [];

  if (feedbackCount === 0) {
    rationale.push("No interviewer feedback submitted yet; overall recommendation unavailable.");
    return {
      feedbackCount,
      interviewerCount,
      pendingFeedbackCount,
      averageRating,
      ratingCount,
      recommendationVotes,
      recommendationScoreAverage,
      overallRecommendation: null,
      confidence: "insufficient",
      feedbackSummary: {
        strengths: [],
        weaknesses: [],
        notes: [],
      },
      reviewerSummaries: [],
      rationale,
    };
  }

  const scoreBased =
    recommendationScoreAverage != null
      ? recommendationScoreToEnum(recommendationScoreAverage)
      : null;

  if (pluralityShare >= 0.5 && pluralityWinner) {
    overallRecommendation = applyRatingGuardrails(pluralityWinner, averageRating);
    rationale.push(
      `Plurality recommendation: ${pluralityWinner} (${Math.round(pluralityShare * 100)}% of ${feedbackCount} submission(s)).`
    );
    if (scoreBased && scoreBased !== pluralityWinner) {
      rationale.push(
        `Score-weighted average maps to ${scoreBased}; rating guardrails applied where relevant.`
      );
    }
  } else if (scoreBased) {
    overallRecommendation = applyRatingGuardrails(scoreBased, averageRating);
    rationale.push(
      `Split panel votes; overall derived from mean recommendation score (${recommendationScoreAverage}).`
    );
  }

  if (averageRating != null) {
    rationale.push(
      `Average numeric rating: ${averageRating} across ${ratingCount} rated submission(s).`
    );
  }

  if (pendingFeedbackCount > 0) {
    rationale.push(
      `${pendingFeedbackCount} assigned interviewer(s) have not submitted feedback yet.`
    );
  }

  const ratingSpread = computeRatingSpread(ratings);
  const confidence = resolveConfidence({
    feedbackCount,
    interviewerCount,
    pluralityShare,
    ratingSpread,
  });

  return {
    feedbackCount,
    interviewerCount,
    pendingFeedbackCount,
    averageRating,
    ratingCount,
    recommendationVotes,
    recommendationScoreAverage,
    overallRecommendation,
    confidence,
    feedbackSummary: {
      strengths: uniqueFeedbackLines(strengthLines),
      weaknesses: uniqueFeedbackLines(weaknessLines),
      notes: uniqueFeedbackLines(noteLines, 8),
    },
    reviewerSummaries: feedback.map((row) => ({
      reviewerId: row.reviewerId,
      reviewerName: row.reviewerName,
      rating: row.rating,
      recommendation: row.recommendation,
      strengths: row.strengths,
      weaknesses: row.weaknesses,
    })),
    rationale,
  };
}
