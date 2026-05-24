import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { isAdmin } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import type { ApplicationStage } from "@prisma/client";

const STAGES: ApplicationStage[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
  "REJECTED",
];

const STAGE_TO_KEY: Record<ApplicationStage, string> = {
  APPLIED: "appliedCount",
  SCREENING: "screeningCount",
  INTERVIEW: "interviewCount",
  TECHNICAL: "technicalCount",
  FINAL_ROUND: "finalRoundCount",
  OFFER_SENT: "offerSentCount",
  HIRED: "hiredCount",
  REJECTED: "rejectedCount",
};

/**
 * GET /api/pipeline/stats — application counts per stage for recruitment analytics dashboards.
 * Optional jobId: counts for that job only; omit for global counts.
 * Response: { appliedCount, screeningCount, interviewCount, technicalCount, finalRoundCount, offerSentCount, hiredCount, rejectedCount }
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";

  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() || undefined;
  const allowedJobIds = isAdmin(role)
    ? null
    : (
        await prisma.jobAssignment.findMany({
          where: { userId },
          select: { jobId: true },
          distinct: ["jobId"],
        })
      ).map((r) => r.jobId);
  if (jobId && allowedJobIds != null && !allowedJobIds.includes(jobId)) {
    return NextResponse.json(
      STAGES.reduce(
        (acc, stage) => ({ ...acc, [STAGE_TO_KEY[stage]]: 0 }),
        {} as Record<string, number>
      )
    );
  }
  const where = {
    withdrawnAt: null as null,
    ...(jobId ? { jobId } : {}),
    ...(!jobId && allowedJobIds != null ? { jobId: { in: allowedJobIds } } : {}),
  };

  const counts = await prisma.application.groupBy({
    by: ["stage"],
    where,
    _count: { id: true },
  });

  const stats = STAGES.reduce(
    (acc, stage) => {
      acc[STAGE_TO_KEY[stage] as keyof typeof acc] = 0;
      return acc;
    },
    {} as Record<string, number>
  );

  for (const row of counts) {
    stats[STAGE_TO_KEY[row.stage]] = row._count.id;
  }

  return NextResponse.json(stats);
}
