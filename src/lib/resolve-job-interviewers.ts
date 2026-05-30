import { prisma } from "@/src/lib/prisma";

/**
 * Comma-separated names of users assigned to the job (interviewer / HM pool).
 */
export async function resolveJobInterviewerNames(jobId: string): Promise<string> {
  const rows = await prisma.jobAssignment.findMany({
    where: { jobId },
    select: { user: { select: { name: true } } },
    orderBy: { assignedAt: "asc" },
  });

  const names = rows
    .map((r) => r.user.name?.trim())
    .filter((n): n is string => Boolean(n));

  return names.length > 0 ? names.join(", ") : "";
}
