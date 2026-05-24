import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { buildApplicationVisibilityWhere, buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/candidates/[id]/applications — list applications for a candidate (job, stage, feedback, rating). Tracks candidate progress. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id: candidateId } = await context.params;
  if (!candidateId) return NextResponse.json({ error: "Missing candidate id" }, { status: 400 });

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, ...buildCandidateVisibilityWhere(role, userId) },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const applications = await prisma.application.findMany({
    where: {
      candidateId,
      withdrawnAt: null,
      ...buildApplicationVisibilityWhere(role, userId),
    },
    orderBy: { appliedDate: "desc" },
    select: {
      id: true,
      jobId: true,
      stage: true,
      rating: true,
      rejectionReason: true,
      feedback: true,
      interviewDate: true,
      appliedDate: true,
      job: true,
    },
  });

  const data = applications.map((a) => ({
    id: a.id,
    jobId: a.jobId,
    job: a.job,
    stage: a.stage,
    rating: a.rating,
    rejectionReason: a.rejectionReason,
    feedback: a.feedback,
    interviewDate: a.interviewDate,
    appliedDate: a.appliedDate,
  }));

  return NextResponse.json(data);
}
