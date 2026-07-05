import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { createJobFromBody } from "@/src/lib/job-create-from-body";
import { canCreateJob } from "@/src/lib/rbac";
import { buildJobVisibilityWhere } from "@/src/lib/rbac-scope";
import { countUniqueActiveApplicantsByJobIds } from "@/src/lib/candidate-identity";
import { prisma } from "@/src/lib/prisma";
import { computeJobHealthScore } from "@/src/lib/job-health-score";

const MS_PER_DAY = 86_400_000;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_STATUSES = ["OPEN", "PAUSED", "CLOSED"] as const;

/** GET /api/jobs — paginated, filterable list. Query: ?page=1&limit=20&status=OPEN&department=Engineering&search=frontend. Any authenticated user.
 * Each row includes `healthScore` (0–100) from `@/src/lib/job-health-score`; `applicantCount` / `hiredCount` / rates use non-withdrawn applications only (`withdrawnAt` null).
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const userId = typeof session.user?.id === "string" ? session.user.id : undefined;

  const { searchParams } = new URL(request.url);
  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");
  const statusRaw = searchParams.get("status");
  const departmentRaw = searchParams.get("department");
  const searchRaw = searchParams.get("search");

  const page = Math.max(1, parseInt(String(pageRaw), 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(String(limitRaw), 10) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;

  const where: Parameters<typeof prisma.job.findMany>[0]["where"] = buildJobVisibilityWhere(
    role,
    userId
  );
  if (
    statusRaw &&
    VALID_STATUSES.includes(statusRaw as (typeof VALID_STATUSES)[number])
  ) {
    where.status = statusRaw as (typeof VALID_STATUSES)[number];
  }
  if (departmentRaw && departmentRaw.trim()) {
    where.department = departmentRaw.trim();
  }
  if (searchRaw && searchRaw.trim()) {
    where.title = { contains: searchRaw.trim(), mode: "insensitive" };
  }

  const [totalJobs, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const jobIds = jobs.map((j) => j.id);
  const [uniqueApplicantCounts, stageAgg] = await Promise.all([
    countUniqueActiveApplicantsByJobIds(jobIds),
    jobIds.length > 0
      ? await prisma.application.groupBy({
          by: ["jobId", "stage"],
          where: { jobId: { in: jobIds }, withdrawnAt: null },
          _count: { id: true },
        })
      : Promise.resolve([]),
  ]);

  type JobPipelineStats = { pipelineSize: number; hiredCount: number; offerReach: number };
  const statsByJob = new Map<string, JobPipelineStats>();
  for (const row of stageAgg) {
    const cur = statsByJob.get(row.jobId) ?? {
      pipelineSize: 0,
      hiredCount: 0,
      offerReach: 0,
    };
    if (row.stage === "HIRED") cur.hiredCount += row._count.id;
    if (row.stage === "OFFER_SENT" || row.stage === "HIRED") cur.offerReach += row._count.id;
    statsByJob.set(row.jobId, cur);
  }

  const data = jobs.map((job) => {
    const s = statsByJob.get(job.id) ?? { pipelineSize: 0, hiredCount: 0, offerReach: 0 };
    const applicantCount = uniqueApplicantCounts.get(job.id) ?? 0;
    const pipelineSize = applicantCount;
    const hiredCount = s.hiredCount;
    const hiringProgress =
      applicantCount > 0 ? Math.round((hiredCount / applicantCount) * 100) / 100 : 0;
    const conversionRate = applicantCount > 0 ? hiredCount / applicantCount : 0;
    const offerRate = applicantCount > 0 ? s.offerReach / applicantCount : 0;
    const ageDaysOpen = Math.floor(
      Math.max(0, Date.now() - job.createdAt.getTime()) / MS_PER_DAY
    );
    const healthScore = computeJobHealthScore({
      ageDaysOpen,
      pipelineSize,
      conversionRate,
      offerRate,
    });
    return {
      ...job,
      applicantCount,
      hiredCount,
      hiringProgress,
      healthScore,
    };
  });

  const totalPages = totalJobs === 0 ? 0 : Math.ceil(totalJobs / limit);

  return NextResponse.json({
    data,
    page,
    limit,
    totalJobs,
    totalPages,
  });
}

/** POST /api/jobs — create a job. ADMIN and RECRUITER only. */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canCreateJob);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const userId = session.user?.id;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const result = await createJobFromBody(userId.trim(), body);
  if (!result.ok) {
    return NextResponse.json(
      result.details ? { error: result.error, details: result.details } : { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result.job, { status: 201 });
}
