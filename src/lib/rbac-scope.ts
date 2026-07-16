import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { isAdmin } from "@/src/lib/rbac";

const NO_ACCESS = { id: "__no_access__" } as const;

/** Prisma filter: ADMIN → all rows; HM/recruiter → own jobs only. */
export function buildJobVisibilityWhere(
  role: string | undefined,
  userId: string | undefined
): Prisma.JobWhereInput {
  if (isAdmin(role)) return {};
  if (!userId) return NO_ACCESS;
  return { ownerId: userId };
}

/** Prisma filter: ADMIN → all; HM/recruiter → applications on owned jobs. */
export function buildApplicationVisibilityWhere(
  role: string | undefined,
  userId: string | undefined
): Prisma.ApplicationWhereInput {
  if (isAdmin(role)) return {};
  if (!userId) return NO_ACCESS;
  return { job: { ownerId: userId } };
}

/** Prisma filter: ADMIN → all; HM/recruiter → owned candidates (incl. zero-application intake). */
export function buildCandidateVisibilityWhere(
  role: string | undefined,
  userId: string | undefined
): Prisma.CandidateWhereInput {
  if (isAdmin(role)) return {};
  if (!userId) return NO_ACCESS;
  return { ownerId: userId };
}

/**
 * Job ids visible to the caller. `null` = unrestricted (ADMIN). `[]` = none.
 * Shared by dashboard, reports, pipeline — single query, no duplicated assignment logic.
 */
export async function listScopedJobIds(
  role: string | undefined,
  userId: string | undefined,
  filter?: Pick<Prisma.JobWhereInput, "id" | "department" | "status">
): Promise<string[] | null> {
  if (isAdmin(role)) return null;
  if (!userId) return [];
  const rows = await prisma.job.findMany({
    where: { ownerId: userId, ...filter },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function canAccessCandidateForRecommendations(
  role: string | undefined,
  userId: string | undefined,
  candidateId: string
): Promise<boolean> {
  if (isAdmin(role)) return true;
  if (!userId) return false;
  const row = await prisma.candidate.findFirst({
    where: { id: candidateId, ownerId: userId },
    select: { id: true },
  });
  return row != null;
}

export async function canAccessJobByScope(
  role: string | undefined,
  userId: string | undefined,
  jobId: string
): Promise<boolean> {
  if (isAdmin(role)) return true;
  if (!userId) return false;
  const job = await prisma.job.findFirst({
    where: { id: jobId, ownerId: userId },
    select: { id: true },
  });
  return job != null;
}

export async function canAccessCandidateByScope(
  role: string | undefined,
  userId: string | undefined,
  candidateId: string
): Promise<boolean> {
  if (isAdmin(role)) return true;
  if (!userId) return false;
  const row = await prisma.candidate.findFirst({
    where: { id: candidateId, ownerId: userId },
    select: { id: true },
  });
  return row != null;
}

/** Job + candidate must belong to the same owner (and caller when not ADMIN). */
export async function assertSameOwnerJobAndCandidate(
  role: string | undefined,
  userId: string | undefined,
  jobId: string,
  candidateId: string
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" | "OWNER_MISMATCH" }> {
  const [job, candidate] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, select: { id: true, ownerId: true } }),
    prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true, ownerId: true } }),
  ]);
  if (!job || !candidate) return { ok: false, reason: "NOT_FOUND" };
  if (job.ownerId !== candidate.ownerId) return { ok: false, reason: "OWNER_MISMATCH" };
  if (!isAdmin(role)) {
    if (!userId || job.ownerId !== userId) return { ok: false, reason: "FORBIDDEN" };
  }
  return { ok: true };
}
