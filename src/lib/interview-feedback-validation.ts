import type { InterviewRecommendation, InterviewStatus } from "@prisma/client";
import { validateApplicationText } from "@/src/lib/application-text-limits";

export const INTERVIEW_FEEDBACK_MIN_RATING = 1;
export const INTERVIEW_FEEDBACK_MAX_RATING = 5;

const MS_PER_MINUTE = 60_000;

const RECOMMENDATION_VALUES: InterviewRecommendation[] = [
  "STRONG_HIRE",
  "HIRE",
  "NEUTRAL",
  "NO_HIRE",
  "STRONG_NO_HIRE",
];

export function computeInterviewEndTime(scheduledAt: Date, durationMinutes: number): Date {
  return new Date(scheduledAt.getTime() + durationMinutes * MS_PER_MINUTE);
}

/** True when the scheduled interview window has ended (UTC instants). */
export function hasInterviewOccurred(scheduledAt: Date, durationMinutes: number, nowMs = Date.now()): boolean {
  return computeInterviewEndTime(scheduledAt, durationMinutes).getTime() <= nowMs;
}

export function parseInterviewRecommendation(value: unknown): InterviewRecommendation | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return (RECOMMENDATION_VALUES as readonly string[]).includes(raw)
    ? (raw as InterviewRecommendation)
    : null;
}

export function validateInterviewFeedbackRating(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < INTERVIEW_FEEDBACK_MIN_RATING || n > INTERVIEW_FEEDBACK_MAX_RATING) {
    return "invalid";
  }
  return n;
}

export function canSubmitInterviewFeedbackForStatus(status: InterviewStatus): boolean {
  return status !== "CANCELLED";
}

export function validateInterviewFeedbackTextFields(input: {
  strengths?: string | null;
  weaknesses?: string | null;
  notes?: string | null;
}): { code: string; message: string; field: string } | null {
  if (input.strengths != null) {
    const err = validateApplicationText("feedback", input.strengths);
    if (err) return { ...err, field: "strengths" };
  }
  if (input.weaknesses != null) {
    const err = validateApplicationText("feedback", input.weaknesses);
    if (err) return { ...err, field: "weaknesses" };
  }
  if (input.notes != null) {
    const err = validateApplicationText("notes", input.notes);
    if (err) return { ...err, field: "notes" };
  }
  return null;
}
