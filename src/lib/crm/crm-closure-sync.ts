import { prisma } from "@/src/lib/prisma";
import type { Prisma } from "@prisma/client";

function decimalOrNull(v: Prisma.Decimal | null | undefined): Prisma.Decimal | null {
  return v ?? null;
}

/**
 * On Application HIRED: create CrmClosure, mark requirement FILLED, draft invoice.
 */
export async function syncCrmClosureForHiredApplication(applicationId: string): Promise<void> {
  const existing = await prisma.crmClosure.findUnique({
    where: { applicationId },
    select: { id: true },
  });
  if (existing) return;

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      jobId: true,
      candidate: { select: { candidateName: true } },
    },
  });
  if (!application) return;

  const requirement = await prisma.crmRequirement.findFirst({
    where: { jobId: application.jobId },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!requirement) return;

  const revenueAmount = requirement.feeAmount;
  const currency = requirement.currency ?? "INR";

  const closure = await prisma.$transaction(async (tx) => {
    const created = await tx.crmClosure.create({
      data: {
        clientId: requirement.clientId,
        requirementId: requirement.id,
        applicationId,
        feeAmount: decimalOrNull(requirement.feeAmount),
        revenueAmount: decimalOrNull(revenueAmount),
        currency,
        notes: `Placement: ${application.candidate.candidateName}`,
      },
    });

    await tx.crmRequirement.update({
      where: { id: requirement.id },
      data: { status: "FILLED" },
    });

    const invoiceNumber = `INV-${Date.now()}-${applicationId.slice(-6).toUpperCase()}`;
    await tx.crmInvoice.create({
      data: {
        clientId: requirement.clientId,
        closureId: created.id,
        invoiceNumber,
        amount: revenueAmount ?? 0,
        currency,
        status: "DRAFT",
        notes: `Auto-draft for requirement "${requirement.title}"`,
      },
    });

    return created;
  });

  void closure;
}
