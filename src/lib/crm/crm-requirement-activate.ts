import { prisma } from "@/src/lib/prisma";
import type { CrmRequirement } from "@prisma/client";
import { enqueueJobEmbeddingAfterJobChange } from "@/src/lib/job-embedding-enqueue";

/**
 * Activate a CRM requirement: create linked ATS Job and set requirement OPEN.
 */
export async function activateCrmRequirement(
  requirement: CrmRequirement,
  actorUserId: string
): Promise<{ jobId: string }> {
  if (requirement.jobId) {
    return { jobId: requirement.jobId };
  }
  if (requirement.status === "CANCELLED" || requirement.status === "FILLED") {
    throw new Error("Requirement cannot be activated in current status");
  }

  const department = requirement.department?.trim() || "Client Services";
  const location = requirement.location?.trim() || "Remote";

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        title: requirement.title,
        department,
        location,
        description: requirement.description,
        status: "OPEN",
        ownerId: actorUserId,
        createdBy: actorUserId,
        jobMeta: {
          crmRequirementId: requirement.id,
          headcount: requirement.headcount,
          feeType: requirement.feeType,
          feeAmount: requirement.feeAmount != null ? Number(requirement.feeAmount) : null,
          currency: requirement.currency,
        },
      },
    });

    await tx.crmRequirement.update({
      where: { id: requirement.id },
      data: {
        jobId: created.id,
        status: "OPEN",
        department,
        location,
      },
    });

    return created;
  });

  void enqueueJobEmbeddingAfterJobChange(job.id, { reason: "created" }).catch((e) => {
    console.error("[crm-requirement-activate] embedding enqueue failed:", e);
  });

  return { jobId: job.id };
}
