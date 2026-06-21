import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";

/** GET /api/crm/revenue/summary — revenue tracking KPIs. */
export async function GET() {
  const auth = await requireApiAuth(canViewCrm);
  if (auth instanceof NextResponse) return auth;

  const [leadCount, clientCount, openRequirements, closures, invoicesPaid, invoicesDraft, pipelineValue] =
    await Promise.all([
      prisma.crmLead.count({ where: { status: { not: "LOST" } } }),
      prisma.crmClient.count({ where: { status: "ACTIVE" } }),
      prisma.crmRequirement.count({ where: { status: "OPEN" } }),
      prisma.crmClosure.count(),
      prisma.crmInvoice.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.crmInvoice.aggregate({
        where: { status: { in: ["DRAFT", "SENT", "OVERDUE"] } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.crmLead.aggregate({
        where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
        _sum: { expectedValue: true },
      }),
    ]);

  return NextResponse.json({
    leadCount,
    clientCount,
    openRequirements,
    closureCount: closures,
    revenuePaid: {
      total: invoicesPaid._sum.amount != null ? Number(invoicesPaid._sum.amount) : 0,
      count: invoicesPaid._count,
    },
    revenueOutstanding: {
      total: invoicesDraft._sum.amount != null ? Number(invoicesDraft._sum.amount) : 0,
      count: invoicesDraft._count,
    },
    pipelineExpectedValue:
      pipelineValue._sum.expectedValue != null ? Number(pipelineValue._sum.expectedValue) : 0,
  });
}
