import { Prisma } from "@prisma/client";
import type { Job, JobStatus } from "@prisma/client";
import { enqueueJobEmbeddingAfterJobChange } from "@/src/lib/job-embedding-enqueue";
import { validateJobCreatePayload } from "@/src/lib/job-validation";
import { prisma } from "@/src/lib/prisma";

const DEFAULT_PIPELINE_STAGES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER_SENT",
  "HIRED",
];

const arrayOfStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : typeof v === "string"
      ? v
          .split(/[,;]/)
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

const boolOr = (v: unknown, fallback: boolean): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["yes", "true", "1", "y"].includes(s)) return true;
    if (["no", "false", "0", "n"].includes(s)) return false;
  }
  return fallback;
};

const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

function normalizeStatus(raw: unknown): JobStatus {
  if (typeof raw !== "string") return "OPEN";
  const s = raw.trim().toUpperCase();
  if (s === "OPEN" || s === "PAUSED" || s === "CLOSED") return s;
  return "OPEN";
}

export type JobCreateResult =
  | { ok: true; job: Job }
  | { ok: false; status: number; error: string; details?: unknown };

/** Create one job from a POST /api/jobs-shaped body. */
export async function createJobFromBody(
  creatorId: string,
  body: Record<string, unknown>,
  options?: { enqueueEmbedding?: boolean }
): Promise<JobCreateResult> {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const department = typeof body.department === "string" ? body.department.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() || null : null;

  const creatorExists = await prisma.user.findUnique({
    where: { id: creatorId },
    select: { id: true },
  });
  if (!creatorExists) {
    return {
      ok: false,
      status: 400,
      error: "Creator user not found",
      details: { creatorId },
    };
  }

  const yearsOfExperience =
    body.yearsOfExperience != null ? Number(body.yearsOfExperience) : undefined;
  const additionalComments =
    typeof body.additionalComments === "string"
      ? body.additionalComments.trim() || null
      : null;
  const status = normalizeStatus(body.status);
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
  const currency =
    typeof body.currency === "string" ? body.currency.trim().toUpperCase() : null;
  const budgetApprovalStatus =
    typeof body.budgetApprovalStatus === "string"
      ? body.budgetApprovalStatus.trim()
      : null;
  const education = typeof body.education === "string" ? body.education.trim() : null;
  const minimumExperienceYears = numOrNull(body.minimumExperienceYears);
  const locationConstraints =
    typeof body.locationConstraints === "string" ? body.locationConstraints.trim() : null;
  const resumeMatchThresholdRaw = body.resumeMatchThreshold;
  const resumeMatchThreshold =
    resumeMatchThresholdRaw === null ||
    resumeMatchThresholdRaw === undefined ||
    resumeMatchThresholdRaw === ""
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
    return { ok: false, status: 400, error: createValidationError.error };
  }

  const descriptionForDb = description?.trim() || jobMeta.roleSummary?.trim() || null;
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
      return {
        ok: false,
        status: 400,
        error: "All hiringManagerIds must belong to HIRING_MANAGER users",
      };
    }
  }

  try {
    const job = await prisma.$transaction(async (tx) => {
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
            assignedById: creatorId,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    if (options?.enqueueEmbedding !== false) {
      void enqueueJobEmbeddingAfterJobChange(job.id, { reason: "created" }).catch((e) => {
        console.error("[createJobFromBody] embedding enqueue failed:", e);
      });
    }

    return { ok: true, job };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return {
        ok: false,
        status: 400,
        error: "Foreign key constraint violated",
        details: {
          creatorId,
          field: (error.meta as { field_name?: string })?.field_name ?? null,
        },
      };
    }
    throw error;
  }
}
