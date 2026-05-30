import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { validateJobCreatePayload } from "@/src/lib/job-validation";
import { canCreateJob } from "@/src/lib/rbac";
import { buildJobVisibilityWhere } from "@/src/lib/rbac-scope";
import { countUniqueActiveApplicantsByJobIds } from "@/src/lib/candidate-identity";
import { enqueueJobEmbeddingAfterJobChange } from "@/src/lib/job-embedding-enqueue";
import { prisma } from "@/src/lib/prisma";
import { computeJobHealthScore } from "@/src/lib/job-health-score";
import type { JobStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

const MS_PER_DAY = 86_400_000;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_STATUSES = ["OPEN", "PAUSED", "CLOSED"] as const;
const DEFAULT_PIPELINE_STAGES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER_SENT",
  "HIRED",
];

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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const department = typeof body?.department === "string" ? body.department.trim() : "";
  const location = typeof body?.location === "string" ? body.location.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;

  const userId = session.user?.id;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const creatorId = userId.trim();
  const creatorExists = await prisma.user.findUnique({
    where: { id: creatorId },
    select: { id: true },
  });
  if (!creatorExists) {
    return NextResponse.json(
      {
        error: "Creator user not found",
        details: { creatorId },
      },
      { status: 400 }
    );
  }

  const yearsOfExperience =
    body.yearsOfExperience != null ? Number(body.yearsOfExperience) : undefined;
  const additionalComments = typeof body.additionalComments === "string" ? body.additionalComments.trim() || null : null;
  const statusRaw = body.status;
  const status: JobStatus =
    statusRaw === "OPEN" || statusRaw === "PAUSED" || statusRaw === "CLOSED" ? statusRaw : "OPEN";
  const arrayOfStrings = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  const boolOr = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;
  const numOrNull = (v: unknown): number | null =>
    v === null || v === undefined || v === "" ? null : Number(v);
  const numberOfOpenings = Number(body.numberOfOpenings ?? 1);
  const roleSummary = typeof body.roleSummary === "string" ? body.roleSummary.trim() : "";
  const keyResponsibilities =
    typeof body.keyResponsibilities === "string" ? body.keyResponsibilities.trim() : "";
  const requiredSkills = arrayOfStrings(body.requiredSkills);
  const preferredSkills = arrayOfStrings(body.preferredSkills);
  const experienceRequired =
    typeof body.experienceRequired === "string" ? body.experienceRequired.trim() : "";
  const pipelineStages = arrayOfStrings(body.pipelineStages);
  const salaryMin = numOrNull(body.salaryMin);
  const salaryMax = numOrNull(body.salaryMax);
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : null;
  const budgetApprovalStatus =
    typeof body.budgetApprovalStatus === "string" ? body.budgetApprovalStatus.trim() : null;
  const education = typeof body.education === "string" ? body.education.trim() : null;
  const minimumExperienceYears = numOrNull(body.minimumExperienceYears);
  const locationConstraints =
    typeof body.locationConstraints === "string" ? body.locationConstraints.trim() : null;
  const resumeMatchThresholdRaw = body.resumeMatchThreshold;
  const resumeMatchThreshold =
    resumeMatchThresholdRaw === null || resumeMatchThresholdRaw === undefined || resumeMatchThresholdRaw === ""
      ? null
      : Number(resumeMatchThresholdRaw);
  const applicationDeadline =
    typeof body.applicationDeadline === "string" && body.applicationDeadline.trim()
      ? body.applicationDeadline.trim()
      : null;
  const allowReferrals = boolOr(body.allowReferrals, true);
  const tags = arrayOfStrings(body.tags);
  const employmentType =
    typeof body.employmentType === "string" ? body.employmentType.trim().toUpperCase() : "";
  const hiringManagerIds = arrayOfStrings(body.hiringManagerIds);
  const jobMeta = {
    employmentType,
    numberOfOpenings,
    roleSummary,
    keyResponsibilities,
    requiredSkills,
    preferredSkills,
    experienceRequired,
    pipelineStages: pipelineStages.length ? pipelineStages : DEFAULT_PIPELINE_STAGES,
    salaryMin,
    salaryMax,
    currency,
    budgetApprovalStatus,
    education,
    minimumExperienceYears,
    locationConstraints,
    resumeMatchThreshold,
    applicationDeadline,
    allowReferrals,
    tags,
  };
  const createValidationError = validateJobCreatePayload({
    title,
    department,
    location,
    jobMeta,
  });
  if (createValidationError) {
    return NextResponse.json(createValidationError, { status: 400 });
  }

  const descriptionForDb =
    description?.trim() || jobMeta.roleSummary?.trim() || null;
  const yearsOfExperienceColumn =
    jobMeta.minimumExperienceYears != null && Number.isInteger(jobMeta.minimumExperienceYears)
      ? jobMeta.minimumExperienceYears
      : Number.isInteger(yearsOfExperience)
        ? yearsOfExperience
        : undefined;
  if (hiringManagerIds.length > 0) {
    const hmCount = await prisma.user.count({
      where: { id: { in: hiringManagerIds }, role: "HIRING_MANAGER" },
    });
    if (hmCount !== hiringManagerIds.length) {
      return NextResponse.json(
        { error: "All hiringManagerIds must belong to HIRING_MANAGER users" },
        { status: 400 }
      );
    }
  }

  let job;
  try {
    job = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          title,
          department,
          location,
          yearsOfExperience: yearsOfExperienceColumn,
          description: descriptionForDb,
          additionalComments,
          jobMeta: jobMeta as Prisma.InputJsonValue,
          requiredSkills,
          preferredSkills,
          status,
          createdBy: creatorId,
        },
      });
      if (hiringManagerIds.length > 0) {
        await tx.jobAssignment.createMany({
          data: hiringManagerIds.map((hmId) => ({
            jobId: created.id,
            userId: hmId,
            assignedBy: creatorId,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        {
          error: "Foreign key constraint violated",
          details: {
            creatorId,
            field: (error.meta as any)?.field_name ?? null,
          },
        },
        { status: 400 }
      );
    }
    throw error;
  }

  void enqueueJobEmbeddingAfterJobChange(job.id, { reason: "created" }).catch((e) => {
    console.error("[POST /api/jobs] embedding enqueue failed:", e);
  });
  return NextResponse.json(job, { status: 201 });
}
