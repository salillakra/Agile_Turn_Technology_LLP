import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { dedupeApplicationsByCandidateIdentity } from "@/src/lib/candidate-identity";
import { prisma } from "@/src/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/jobs/[id]/applications — list applicants for a job (candidate profile, stage, rating, applied date). Powers job applicant list. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id: jobId } = await context.params;
  if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  if (!(await canAccessJobByScope(role, userId, jobId))) {
    return NextResponse.json({ error: "You do not have access to this job" }, { status: 403 });
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const applications = dedupeApplicationsByCandidateIdentity(
    await prisma.application.findMany({
      where: { jobId, withdrawnAt: null },
      orderBy: { appliedDate: "desc" },
      select: {
        id: true,
        jobId: true,
        candidateId: true,
        stage: true,
        rating: true,
        rejectionReason: true,
        appliedDate: true,
        candidate: true,
      },
    })
  );

  const data = applications.map((a) => ({
    id: a.id,
    candidateId: a.candidateId,
    stage: a.stage,
    rating: a.rating,
    rejectionReason: a.rejectionReason,
    appliedDate: a.appliedDate,
    candidate: a.candidate,
  }));

  return NextResponse.json(data);
}
