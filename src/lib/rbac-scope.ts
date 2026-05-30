import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { isAdmin, isHiringManager, isRecruiter } from "@/src/lib/rbac";

/** Job scope for HM/recruiter: only jobs assigned via JobAssignment. */
export function buildJobVisibilityWhere(
  role: string | undefined,
  userId: string | undefined
): Prisma.JobWhereInput {
  if (isAdmin(role)) return {};
  if (!userId) return { id: "__no_access__" };
  return { assignments: { some: { userId } } };
}

/** Application scope for HM/recruiter: applications whose job is assigned to the user. */
export function buildApplicationVisibilityWhere(
  role: string | undefined,
  userId: string | undefined
): Prisma.ApplicationWhereInput {
  if (isAdmin(role)) return {};
  if (!userId) return { id: "__no_access__" };
  return { job: { assignments: { some: { userId } } } };
}

/** Candidate scope for HM/recruiter: candidates with at least one app in assigned jobs. */
export function buildCandidateVisibilityWhere(
  role: string | undefined,
  userId: string | undefined
): Prisma.CandidateWhereInput {
  if (isAdmin(role)) return {};
  if (!userId) return { id: "__no_access__" };
  return {
    applications: {
      some: {
        job: {
          assignments: { some: { userId } },
        },
      },
    },
  };
}

/**
 * Recommendations for a candidate (includes Add Applicant / intake before first application).
 * ADMIN: always. HM/recruiter: usual candidate scope, or candidate has zero applications and
 * the user has at least one job assignment (can see open roles to recommend into).
 */
export async function canAccessCandidateForRecommendations(
  role: string | undefined,
  userId: string | undefined,
  candidateId: string
): Promise<boolean> {
  if (isAdmin(role)) return true;
  if (!userId) return false;

  const scoped = await prisma.candidate.findFirst({
    where: { id: candidateId, ...buildCandidateVisibilityWhere(role, userId) },
    select: { id: true },
  });
  if (scoped) return true;

  const applicationCount = await prisma.application.count({ where: { candidateId } });

  // Add Applicant / résumé intake: candidate exists but is not on any job yet.
  if (applicationCount === 0 && (isRecruiter(role) || isHiringManager(role))) {
    return true;
  }

  const assignmentCount = await prisma.jobAssignment.count({ where: { userId } });
  return applicationCount === 0 && assignmentCount > 0;
}

/** Object-level authorization helper for job-bound resources. */
export async function canAccessJobByScope(
  role: string | undefined,
  userId: string | undefined,
  jobId: string
): Promise<boolean> {
  if (isAdmin(role)) return true;
  if (!userId) return false;
  const link = await prisma.jobAssignment.findUnique({
    where: { jobId_userId: { jobId, userId } },
    select: { id: true },
  });
  return link != null;
}
