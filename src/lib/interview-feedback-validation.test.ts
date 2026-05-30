import { describe, expect, it } from "vitest";
import {
  computeInterviewEndTime,
  hasInterviewOccurred,
  parseInterviewRecommendation,
  validateInterviewFeedbackRating,
  canSubmitInterviewFeedbackForStatus,
} from "@/src/lib/interview-feedback-validation";

describe("hasInterviewOccurred", () => {
  it("returns false before interview window ends", () => {
    const start = new Date("2026-06-01T10:00:00.000Z");
    const now = start.getTime() + 30 * 60_000;
    expect(hasInterviewOccurred(start, 60, now)).toBe(false);
  });

  it("returns true after interview window ends", () => {
    const start = new Date("2026-06-01T10:00:00.000Z");
    const now = computeInterviewEndTime(start, 60).getTime();
    expect(hasInterviewOccurred(start, 60, now)).toBe(true);
  });
});

describe("validateInterviewFeedbackRating", () => {
  it("accepts 1–5 integers", () => {
    expect(validateInterviewFeedbackRating(3)).toBe(3);
  });

  it("rejects out of range", () => {
    expect(validateInterviewFeedbackRating(0)).toBe("invalid");
    expect(validateInterviewFeedbackRating(6)).toBe("invalid");
  });

  it("allows omitted rating", () => {
    expect(validateInterviewFeedbackRating(undefined)).toBeNull();
  });
});

describe("parseInterviewRecommendation", () => {
  it("parses enum values", () => {
    expect(parseInterviewRecommendation("STRONG_HIRE")).toBe("STRONG_HIRE");
  });

  it("rejects unknown values", () => {
    expect(parseInterviewRecommendation("MAYBE")).toBeNull();
  });
});

describe("canSubmitInterviewFeedbackForStatus", () => {
  it("blocks cancelled interviews", () => {
    expect(canSubmitInterviewFeedbackForStatus("CANCELLED")).toBe(false);
  });

  it("allows scheduled interviews (time gate is separate)", () => {
    expect(canSubmitInterviewFeedbackForStatus("SCHEDULED")).toBe(true);
  });
});
