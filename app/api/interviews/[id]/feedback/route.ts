import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate, isAdmin } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { logInterviewFeedbackSubmitted } from "@/src/lib/interview-activity-log";
import {
  canSubmitInterviewFeedbackForStatus,
  hasInterviewOccurred,
  parseInterviewRecommendation,
  validateInterviewFeedbackRating,
  validateInterviewFeedbackTextFields,
  INTERVIEW_FEEDBACK_MIN_RATING,
  INTERVIEW_FEEDBACK_MAX_RATING,
} from "@/src/lib/interview-feedback-validation";

export const runtime = "nodejs";

/**
 * POST /api/interviews/[id]/feedback
 *
 * 1. Submit structured feedback (rating, strengths, weaknesses, recommendation, notes).
 * 2. One submission per reviewer (`@@unique([interviewId, reviewerId])`).
 * 3. Validate rating (1–5 integer when provided).
 * 4. Reject feedback before the interview window ends.
 *
 * Body:
 * - recommendation (required): STRONG_HIRE | HIRE | NEUTRAL | NO_HIRE | STRONG_NO_HIRE
 * - rating (optional): 1–5
 * - strengths, weaknesses, notes (optional strings)
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const actorUserId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  const interviewId = typeof id === "string" ? id.trim() : "";
  if (!interviewId || !isValidCuid(interviewId)) {
    return apiError("INVALID_ID", "Malformed interview id", 400);
  }

  if (!actorUserId) {
    return apiError("UNAUTHORIZED", "Missing user session", 401);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const recommendation = parseInterviewRecommendation(body.recommendation);
  if (!recommendation) {
    return apiError(
      "VALIDATION_ERROR",
      "recommendation is required and must be one of: STRONG_HIRE, HIRE, NEUTRAL, NO_HIRE, STRONG_NO_HIRE",
      400
    );
  }

  const ratingResult = validateInterviewFeedbackRating(body.rating);
  if (ratingResult === "invalid") {
    return apiError(
      "VALIDATION_ERROR",
      `rating must be an integer between ${INTERVIEW_FEEDBACK_MIN_RATING} and ${INTERVIEW_FEEDBACK_MAX_RATING}`,
      400
    );
  }

  const strengths =
    typeof body.strengths === "string" ? body.strengths.trim() || null : null;
  const weaknesses =
    typeof body.weaknesses === "string" ? body.weaknesses.trim() || null : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  const textError = validateInterviewFeedbackTextFields({ strengths, weaknesses, notes });
  if (textError) {
    return apiError(textError.code, `${textError.field}: ${textError.message}`, 400);
  }

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      applicationId: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      application: { select: { jobId: true, candidateId: true } },
      interviewers: { select: { userId: true } },
      feedback: { where: { reviewerId: actorUserId }, select: { id: true } },
    },
  });

  if (!interview?.application) {
    return apiError("NOT_FOUND", "Interview not found", 404);
  }

  if (!(await canAccessJobByScope(role, actorUserId, interview.application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this interview", 403);
  }

  if (!canSubmitInterviewFeedbackForStatus(interview.status)) {
    return apiError("INVALID_STATE", "Cannot submit feedback for a cancelled interview", 409, {
      status: interview.status,
    });
  }

  const isAssignedInterviewer = interview.interviewers.some((row) => row.userId === actorUserId);
  if (!isAssignedInterviewer && !isAdmin(role)) {
    return apiError(
      "FORBIDDEN",
      "Only assigned interviewers may submit feedback for this interview",
      403
    );
  }

  if (!hasInterviewOccurred(interview.scheduledAt, interview.durationMinutes)) {
    return apiError(
      "INTERVIEW_NOT_OCCURRED",
      "Feedback cannot be submitted before the scheduled interview has ended",
      409,
      {
        scheduledAt: interview.scheduledAt.toISOString(),
        durationMinutes: interview.durationMinutes,
      }
    );
  }

  if (interview.feedback.length > 0) {
    return apiError(
      "DUPLICATE_FEEDBACK",
      "You have already submitted feedback for this interview",
      409,
      { existingFeedbackId: interview.feedback[0]!.id }
    );
  }

  try {
    const created = await prisma.interviewFeedback.create({
      data: {
        interviewId,
        reviewerId: actorUserId,
        rating: ratingResult,
        strengths,
        weaknesses,
        recommendation,
        notes,
      },
      include: {
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    void logInterviewFeedbackSubmitted({
      interviewId,
      applicationId: interview.applicationId,
      candidateId: interview.application.candidateId,
      reviewerId: actorUserId,
      userId: actorUserId,
      rating: ratingResult,
      recommendation,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return apiError(
        "DUPLICATE_FEEDBACK",
        "You have already submitted feedback for this interview",
        409
      );
    }
    throw e;
  }
}
