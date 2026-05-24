import { prisma } from "@/src/lib/prisma";
import type { Role } from "@prisma/client";
import { isValidCuid } from "@/src/lib/validate-id";

export type ReportsJobFilterParams = {
  role: Role | string | undefined;
  userId: string | undefined;
  jobId: string | null;
  department: string | null;
};

export type ReportsJobScope = {
  /**
   * If null, means "no job restriction" (ADMIN without jobId/department filters).
   * Otherwise it's a list of jobIds the caller is allowed to include (possibly empty).
   */
  jobIds: string[] | null;
  totalJobs: number;
};

/**
 * Computes the job scope used by all Reports endpoints.
 *
 * Rules:
 * - ADMIN: can see all jobs, optionally restricted by query `jobId` and/or `department`.
 * - RECRUITER: assigned jobs only.
 * - HIRING_MANAGER: assigned jobs only.
 * - If query `jobId` is present but malformed, it throws; callers should respond with 400.
 */
export async function getReportsJobScope(
  params: ReportsJobFilterParams
): Promise<ReportsJobScope> {
  const { role, userId, jobId, department } = params;
  const isAdmin = role === "ADMIN";
  const isHiringManager = role === "HIRING_MANAGER";
  const isRecruiter = role === "RECRUITER";
  const scopedUserId = typeof userId === "string" ? userId.trim() : "";

  let jobIds: string[] | null;

  const jobIdTrimmed = jobId?.trim() ?? null;
  if (jobIdTrimmed) {
    if (!isValidCuid(jobIdTrimmed)) {
      throw new Error("INVALID_JOB_ID");
    }
  }

  const wantNoRestriction = isAdmin && !jobIdTrimmed && (!department || !department.trim());
  if (wantNoRestriction) {
    const totalJobs = await prisma.job.count();
    jobIds = null;
    return { jobIds, totalJobs };
  }

  if (isHiringManager || isRecruiter) {
    // HIRING_MANAGER / RECRUITER: only jobs explicitly assigned via JobAssignment.
    const assignmentWhere: Parameters<typeof prisma.jobAssignment.findMany>[0]["where"] = {
      userId: scopedUserId,
    };
    if (jobIdTrimmed) assignmentWhere.jobId = jobIdTrimmed;
    if (department && department.trim()) {
      assignmentWhere.job = { department: department.trim() };
    }

    const links = await prisma.jobAssignment.findMany({
      where: assignmentWhere,
      select: { jobId: true },
      distinct: ["jobId"],
    });
    const assignedJobIds = links.map((l) => l.jobId);
    return { jobIds: assignedJobIds, totalJobs: assignedJobIds.length };
  }

  const jobWhere: Parameters<typeof prisma.job.findMany>[0]["where"] = {};
  if (jobIdTrimmed) jobWhere.id = jobIdTrimmed;
  if (department && department.trim()) {
    jobWhere.department = department.trim();
  }

  const jobs = await prisma.job.findMany({
    where: jobWhere,
    select: { id: true },
  });
  jobIds = jobs.map((j) => j.id);
  return { jobIds, totalJobs: jobIds.length };
}

