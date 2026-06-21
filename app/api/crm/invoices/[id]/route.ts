import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrm, canViewCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import type { CrmInvoiceStatus } from "@prisma/client";

const VALID_STATUSES: CrmInvoiceStatus[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"];

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/crm/invoices/[id] — update status (e.g. SENT, PAID). */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageCrm);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id || !isValidCuid(id)) return apiError("INVALID_ID", "Malformed id", 400);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const statusRaw = typeof body.status === "string" ? body.status : null;
  if (!statusRaw || !VALID_STATUSES.includes(statusRaw as CrmInvoiceStatus)) {
    return apiError("VALIDATION_ERROR", "Valid status is required", 400);
  }

  const data: { status: CrmInvoiceStatus; paidAt?: Date | null } = {
    status: statusRaw as CrmInvoiceStatus,
  };
  if (statusRaw === "PAID") {
    data.paidAt = new Date();
  }

  const invoice = await prisma.crmInvoice.update({
    where: { id },
    data,
  });

  return NextResponse.json(invoice);
}

/** GET /api/crm/invoices/[id] */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCrm);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id || !isValidCuid(id)) return apiError("INVALID_ID", "Malformed id", 400);

  const invoice = await prisma.crmInvoice.findUnique({
    where: { id },
    include: {
      client: true,
      closure: { include: { requirement: true, application: { include: { candidate: true, job: true } } } },
    },
  });
  if (!invoice) return apiError("NOT_FOUND", "Invoice not found", 404);

  return NextResponse.json(invoice);
}
