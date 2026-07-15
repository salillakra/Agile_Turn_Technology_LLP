import { prisma } from "@/src/lib/prisma";

/** Display name of the job owner (primary stakeholder under owner-scoped silos). */
export async function resolveJobInterviewerNames(jobId: string): Promise<string> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { owner: { select: { name: true } } },
  });
  const name = job?.owner.name?.trim();
  return name ?? "";
}
