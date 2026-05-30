import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { parseActivityLogDetails } from "@/src/lib/activity-log-parse";
import { INTERVIEW_ACTIVITY_ACTIONS } from "@/src/lib/activity-log-details";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/interviews/[id]/activity
 *
 * Interview-scoped audit feed (`applicationId`, `interviewId`, `interviewerId` on each row).
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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
    select: { applicationId: true, application: { select: { jobId: true } } },
  });
  if (!interview?.application) {
    return apiError("NOT_FOUND", "Interview not found", 404);
  }
  if (!(await canAccessJobByScope(role, userId, interview.application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this interview", 403);
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;

  const where = {
    interviewId,
    action: { in: [...INTERVIEW_ACTIVITY_ACTIONS] },
  };

  const totalLogs = await prisma.activityLog.count({ where });
  const totalPages = totalLogs === 0 ? 0 : Math.ceil(totalLogs / limit);

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
    select: {
      id: true,
      action: true,
      applicationId: true,
      interviewId: true,
      interviewerId: true,
      candidateId: true,
      details: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    interviewId,
    applicationId: interview.applicationId,
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      applicationId: l.applicationId,
      interviewId: l.interviewId,
      interviewerId: l.interviewerId,
      candidateId: l.candidateId,
      details: parseActivityLogDetails(l.details),
      createdAt: l.createdAt,
      user: l.user,
    })),
    page,
    totalPages,
  });
}
