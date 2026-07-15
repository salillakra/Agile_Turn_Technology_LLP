import { prisma } from "@/src/lib/prisma";
import type { Role } from "@prisma/client";
import { isValidCuid } from "@/src/lib/validate-id";
import { listScopedJobIds } from "@/src/lib/rbac-scope";

export type ReportsJobFilterParams = {
  role: Role | string | undefined;
  userId: string | undefined;
  jobId: string | null;
  department: string | null;
};

export type ReportsJobScope = {
  jobIds: string[] | null;
  totalJobs: number;
};

/**
 * Job scope for Reports endpoints.
 * ADMIN: all jobs (optional jobId/department filter). HM/recruiter: owned jobs only.
 */
export async function getReportsJobScope(
  params: ReportsJobFilterParams
): Promise<ReportsJobScope> {
  const { role, userId, jobId, department } = params;
  const scopedUserId = typeof userId === "string" ? userId.trim() : "";

  const jobIdTrimmed = jobId?.trim() ?? null;
  if (jobIdTrimmed && !isValidCuid(jobIdTrimmed)) {
    throw new Error("INVALID_JOB_ID");
  }

  const deptFilter =
    department && department.trim() ? { department: department.trim() } : undefined;
  const idFilter = jobIdTrimmed ? { id: jobIdTrimmed } : undefined;
  const scopedFilter = { ...deptFilter, ...idFilter };

  const ownedIds = await listScopedJobIds(role, scopedUserId, scopedFilter);

  if (ownedIds === null) {
    const totalJobs = await prisma.job.count({
      where: scopedFilter ?? {},
    });
    return { jobIds: null, totalJobs };
  }

  return { jobIds: ownedIds, totalJobs: ownedIds.length };
}
