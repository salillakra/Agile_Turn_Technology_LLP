import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { validateJobFields, validateJobMetaCommon } from "@/src/lib/job-validation";
import { canDeleteJob, canSetJobStatusTo, canUpdateJob } from "@/src/lib/rbac";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import type { JobStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

const VALID_JOB_PUT_STATUSES = ["OPEN", "PAUSED", "CLOSED"] as const;

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/jobs/[id] — job details with analytics (matches GET /api/jobs shape). Any authenticated user. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!(await canAccessJobByScope(role, userId, id))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      _count: { select: { applications: true } },
    },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const applicantCount = job._count.applications;
  const hiredCount = await prisma.application.count({
    where: { jobId: id, stage: "HIRED" },
  });
  const hiringProgress =
    applicantCount > 0 ? Math.round((hiredCount / applicantCount) * 100) / 100 : 0;

  const { _count, ...rest } = job;
  return NextResponse.json({
    ...rest,
    applicantCount,
    hiredCount,
    hiringProgress,
  });
}

/** PUT /api/jobs/[id] — update job. ADMIN and RECRUITER. Rejected if job status is already CLOSED (no edits). Optional `status`: OPEN | PAUSED | CLOSED (e.g. pause or close an open job). */
export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canUpdateJob);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!(await canAccessJobByScope(role, userId, id))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status === "CLOSED") {
    return NextResponse.json(
      { error: "Job is closed and cannot be updated" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: {
    title?: string;
    department?: string;
    location?: string;
    description?: string | null;
    additionalComments?: string | null;
    yearsOfExperience?: number | null;
    status?: JobStatus;
    jobMeta?: Prisma.InputJsonValue;
  } = {};

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    data.title = title;
  }
  if (body.department !== undefined) {
    const department = typeof body.department === "string" ? body.department.trim() : "";
    if (!department) return NextResponse.json({ error: "department cannot be empty" }, { status: 400 });
    data.department = department;
  }
  if (body.location !== undefined) {
    const location = typeof body.location === "string" ? body.location.trim() : "";
    if (!location) return NextResponse.json({ error: "location cannot be empty" }, { status: 400 });
    data.location = location;
  }
  if (body.description !== undefined) {
    data.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (body.additionalComments !== undefined) {
    data.additionalComments = typeof body.additionalComments === "string" ? body.additionalComments.trim() || null : null;
  }
  if (body.yearsOfExperience !== undefined) {
    const v = body.yearsOfExperience;
    data.yearsOfExperience = v === null ? null : Number(v);
    if (data.yearsOfExperience !== null && !Number.isInteger(data.yearsOfExperience)) {
      return NextResponse.json({ error: "yearsOfExperience must be an integer or null" }, { status: 400 });
    }
  }
  if (body.status !== undefined) {
    const statusRaw = body.status;
    if (
      typeof statusRaw !== "string" ||
      !VALID_JOB_PUT_STATUSES.includes(statusRaw as (typeof VALID_JOB_PUT_STATUSES)[number])
    ) {
      return NextResponse.json(
        { error: "status must be one of: OPEN, PAUSED, CLOSED" },
        { status: 400 }
      );
    }
    data.status = statusRaw as JobStatus;
    if (!canSetJobStatusTo(role, data.status)) {
      return apiError("FORBIDDEN", "You are not allowed to set this job status", 403);
    }
  }
  if (body.jobMeta !== undefined) {
    if (body.jobMeta === null || typeof body.jobMeta !== "object" || Array.isArray(body.jobMeta)) {
      return NextResponse.json({ error: "jobMeta must be an object" }, { status: 400 });
    }
    const parsed = body.jobMeta as Record<string, unknown>;
    const jobMeta = {
      employmentType:
        typeof parsed.employmentType === "string" ? parsed.employmentType.trim() : undefined,
      numberOfOpenings:
        parsed.numberOfOpenings == null ? undefined : Number(parsed.numberOfOpenings),
      roleSummary: typeof parsed.roleSummary === "string" ? parsed.roleSummary.trim() : undefined,
      keyResponsibilities:
        typeof parsed.keyResponsibilities === "string" ? parsed.keyResponsibilities.trim() : undefined,
      requiredSkills: Array.isArray(parsed.requiredSkills)
        ? parsed.requiredSkills
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
        : undefined,
      preferredSkills: Array.isArray(parsed.preferredSkills)
        ? parsed.preferredSkills
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
        : undefined,
      experienceRequired:
        typeof parsed.experienceRequired === "string"
          ? parsed.experienceRequired.trim()
          : undefined,
      salaryMin: parsed.salaryMin == null ? null : Number(parsed.salaryMin),
      salaryMax: parsed.salaryMax == null ? null : Number(parsed.salaryMax),
      education: typeof parsed.education === "string" ? parsed.education.trim() : undefined,
      minimumExperienceYears:
        parsed.minimumExperienceYears == null ? null : Number(parsed.minimumExperienceYears),
      locationConstraints:
        typeof parsed.locationConstraints === "string"
          ? parsed.locationConstraints.trim()
          : undefined,
      resumeMatchThreshold:
        parsed.resumeMatchThreshold === null || parsed.resumeMatchThreshold === undefined || parsed.resumeMatchThreshold === ""
          ? null
          : Number(parsed.resumeMatchThreshold),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
        : undefined,
    };
    const metaValidationError = validateJobMetaCommon(jobMeta);
    if (metaValidationError) {
      return NextResponse.json(metaValidationError, { status: 400 });
    }
    data.jobMeta = parsed as Prisma.InputJsonValue;
  }

  const validationError = validateJobFields(data);
  if (validationError) {
    return NextResponse.json(validationError, { status: 400 });
  }

  const updated = await prisma.job.update({
    where: { id },
    data,
  });
  return NextResponse.json(updated);
}

/** DELETE /api/jobs/[id] — delete job. ADMIN only. 409 if job has existing applications. */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canDeleteJob);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job._count.applications > 0) {
    return NextResponse.json(
      { error: "Cannot delete job with existing applications" },
      { status: 409 }
    );
  }

  await prisma.job.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
