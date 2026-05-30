import { describe, expect, it } from "vitest";
import {
  aggregateInterviewDecision,
  recommendationScoreToEnum,
  splitFeedbackBulletLines,
  uniqueFeedbackLines,
} from "@/src/lib/interview-decision-aggregation";

describe("recommendationScoreToEnum", () => {
  it("maps high scores to STRONG_HIRE", () => {
    expect(recommendationScoreToEnum(1.5)).toBe("STRONG_HIRE");
  });

  it("maps low scores to STRONG_NO_HIRE", () => {
    expect(recommendationScoreToEnum(-1.5)).toBe("STRONG_NO_HIRE");
  });
});

describe("aggregateInterviewDecision", () => {
  it("returns insufficient when no feedback", () => {
    const result = aggregateInterviewDecision({ feedback: [], interviewerCount: 2 });
    expect(result.confidence).toBe("insufficient");
    expect(result.overallRecommendation).toBeNull();
  });

  it("aggregates unanimous STRONG_HIRE panel", () => {
    const result = aggregateInterviewDecision({
      interviewerCount: 2,
      feedback: [
        {
          reviewerId: "a",
          reviewerName: "Alex",
          rating: 5,
          recommendation: "STRONG_HIRE",
          strengths: "System design",
          weaknesses: null,
          notes: null,
        },
        {
          reviewerId: "b",
          reviewerName: "Blake",
          rating: 4,
          recommendation: "STRONG_HIRE",
          strengths: "Communication",
          weaknesses: null,
          notes: null,
        },
      ],
    });
    expect(result.overallRecommendation).toBe("STRONG_HIRE");
    expect(result.averageRating).toBe(4.5);
    expect(result.feedbackSummary.strengths).toContain("System design");
  });

  it("resolves split votes via recommendation score average", () => {
    const result = aggregateInterviewDecision({
      interviewerCount: 3,
      feedback: [
        {
          reviewerId: "a",
          reviewerName: "A",
          rating: 3,
          recommendation: "HIRE",
          strengths: null,
          weaknesses: null,
          notes: null,
        },
        {
          reviewerId: "b",
          reviewerName: "B",
          rating: 3,
          recommendation: "NO_HIRE",
          strengths: null,
          weaknesses: null,
          notes: null,
        },
        {
          reviewerId: "c",
          reviewerName: "C",
          rating: 3,
          recommendation: "NEUTRAL",
          strengths: null,
          weaknesses: null,
          notes: null,
        },
      ],
    });
    expect(result.overallRecommendation).toBe("NEUTRAL");
    expect(result.recommendationScoreAverage).toBe(0);
    expect(result.pendingFeedbackCount).toBe(0);
  });

  it("applies rating guardrails when high hire vote conflicts with low average rating", () => {
    const result = aggregateInterviewDecision({
      interviewerCount: 1,
      feedback: [
        {
          reviewerId: "a",
          reviewerName: "A",
          rating: 1,
          recommendation: "STRONG_HIRE",
          strengths: null,
          weaknesses: "Weak fundamentals",
          notes: null,
        },
      ],
    });
    expect(result.overallRecommendation).toBe("NO_HIRE");
    expect(result.feedbackSummary.weaknesses).toContain("Weak fundamentals");
  });
});

describe("splitFeedbackBulletLines", () => {
  it("splits newline bullets", () => {
    expect(splitFeedbackBulletLines("- Fast learner\n- Clear communicator")).toEqual([
      "Fast learner",
      "Clear communicator",
    ]);
  });
});

describe("uniqueFeedbackLines", () => {
  it("dedupes case-insensitively", () => {
    expect(uniqueFeedbackLines(["Leadership", "leadership", "SQL"])).toEqual(["Leadership", "SQL"]);
  });
});
