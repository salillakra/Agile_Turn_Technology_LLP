import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import {
  aggregateInterviewDecision,
  type InterviewFeedbackAggregationInput,
} from "@/src/lib/interview-decision-aggregation";

export const runtime = "nodejs";

/**
 * GET /api/interviews/[id]/decision
 *
 * Aggregate panel feedback (ratings, recommendations, text summaries) into an
 * overall interview recommendation. Rule-based only — no AI.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  const interviewId = typeof id === "string" ? id.trim() : "";
  if (!interviewId || !isValidCuid(interviewId)) {
    return apiError("INVALID_ID", "Malformed interview id", 400);
  }

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      applicationId: true,
      title: true,
      interviewType: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      application: { select: { jobId: true } },
      interviewers: { select: { userId: true } },
      feedback: {
        orderBy: { submittedAt: "asc" },
        select: {
          id: true,
          reviewerId: true,
          rating: true,
          recommendation: true,
          strengths: true,
          weaknesses: true,
          notes: true,
          submittedAt: true,
          reviewer: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!interview?.application) {
    return apiError("NOT_FOUND", "Interview not found", 404);
  }

  if (!(await canAccessJobByScope(role, userId, interview.application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this interview", 403);
  }

  const feedbackInputs: InterviewFeedbackAggregationInput[] = interview.feedback.map((row) => ({
    reviewerId: row.reviewerId,
    reviewerName: row.reviewer.name,
    rating: row.rating,
    recommendation: row.recommendation,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    notes: row.notes,
  }));

  const decision = aggregateInterviewDecision({
    feedback: feedbackInputs,
    interviewerCount: interview.interviewers.length,
  });

  return NextResponse.json({
    interview: {
      id: interview.id,
      applicationId: interview.applicationId,
      title: interview.title,
      interviewType: interview.interviewType,
      scheduledAt: interview.scheduledAt.toISOString(),
      durationMinutes: interview.durationMinutes,
      status: interview.status,
    },
    decision,
    feedback: interview.feedback.map((row) => ({
      id: row.id,
      reviewerId: row.reviewerId,
      reviewer: row.reviewer,
      rating: row.rating,
      recommendation: row.recommendation,
      strengths: row.strengths,
      weaknesses: row.weaknesses,
      notes: row.notes,
      submittedAt: row.submittedAt.toISOString(),
    })),
  });
}
