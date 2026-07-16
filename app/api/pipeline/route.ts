import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { listScopedJobIds } from "@/src/lib/rbac-scope";
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

const DEFAULT_LIMIT_PER_STAGE = 50;
const MAX_LIMIT_PER_STAGE = 200;

const APPLICATION_SELECT = {
  id: true,
  candidateId: true,
  jobId: true,
  stage: true,
  rating: true,
  rejectionReason: true,
  appliedDate: true,
  interviewDate: true,
  feedback: true,
  version: true,
  candidate: true,
  job: true,
} as const;

/**
 * GET /api/pipeline — applications grouped by stage with candidate and job.
 * Optional jobId: return only applications for that job (e.g. ?jobId=abc123). Omit for full pipeline across all jobs.
 * Optional limitPerStage: max applications per stage (default 50, max 200).
 * Response: { APPLIED: [...], SCREENING: [...], ... }
 * Powers kanban hiring pipeline.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim() || undefined;
  const limitPerStageRaw = searchParams.get("limitPerStage");

  const limitPerStage = Math.min(
    MAX_LIMIT_PER_STAGE,
    Math.max(
      1,
      parseInt(limitPerStageRaw ?? String(DEFAULT_LIMIT_PER_STAGE), 10) ||
        DEFAULT_LIMIT_PER_STAGE
    )
  );

  const allowedJobIds = await listScopedJobIds(role, userId);
  if (jobId && allowedJobIds != null && !allowedJobIds.includes(jobId)) {
    return NextResponse.json(
      STAGES.reduce((acc, s) => ({ ...acc, [s]: [] }), {} as Record<ApplicationStage, unknown[]>)
    );
  }
  const where: { jobId?: string; jobIdIn?: string[]; withdrawnAt: null } = jobId
    ? { jobId, withdrawnAt: null }
    : { withdrawnAt: null };
  if (!jobId && allowedJobIds != null) {
    where.jobIdIn = allowedJobIds;
  }

  const stageResults = await Promise.all(
    STAGES.map((stage) =>
      prisma.application.findMany({
        where: {
          withdrawnAt: null,
          stage,
          ...(where.jobId ? { jobId: where.jobId } : {}),
          ...(where.jobIdIn ? { jobId: { in: where.jobIdIn } } : {}),
        },
        // Recruiter-friendly ordering: oldest applied first.
        // `createdAt` is used as a stable tie-breaker / fallback.
        orderBy: [{ appliedDate: "asc" }, { createdAt: "asc" }],
        take: limitPerStage,
        select: APPLICATION_SELECT,
      })
    )
  );

  const grouped = STAGES.reduce(
    (acc, stage, i) => {
      acc[stage] = stageResults[i];
      return acc;
    },
    {} as Record<ApplicationStage, typeof stageResults[number]>
  );

  return NextResponse.json(grouped);
}
