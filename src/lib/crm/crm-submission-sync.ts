import { prisma } from "@/src/lib/prisma";

/**
 * When an Application is created for a Job linked to a CrmRequirement, record a CRM submission.
 */
export async function syncCrmSubmissionForApplication(applicationId: string, jobId: string): Promise<void> {
  const requirement = await prisma.crmRequirement.findFirst({
    where: { jobId, status: { in: ["OPEN", "FILLED"] } },
    select: { id: true },
  });
  if (!requirement) return;

  const existing = await prisma.crmSubmission.findUnique({
    where: { applicationId },
    select: { id: true },
  });
  if (existing) return;

  await prisma.crmSubmission.create({
    data: {
      requirementId: requirement.id,
      applicationId,
    },
  });
}
