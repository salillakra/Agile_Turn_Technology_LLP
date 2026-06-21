import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrm, canViewCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import type { CrmInvoiceStatus } from "@prisma/client";

const VALID_STATUSES: CrmInvoiceStatus[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/crm/invoices */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCrm);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId")?.trim();
  const statusRaw = searchParams.get("status")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const where: { clientId?: string; status?: CrmInvoiceStatus } = {};
  if (clientId && isValidCuid(clientId)) where.clientId = clientId;
  if (statusRaw && VALID_STATUSES.includes(statusRaw as CrmInvoiceStatus)) {
    where.status = statusRaw as CrmInvoiceStatus;
  }

  const [total, rows] = await Promise.all([
    prisma.crmInvoice.count({ where }),
    prisma.crmInvoice.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        closure: {
          select: {
            id: true,
            applicationId: true,
            requirement: { select: { id: true, title: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({ data: rows, page, limit, total });
}

/** POST /api/crm/invoices — manual invoice create. */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canManageCrm);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  const amount = body.amount != null ? Number(body.amount) : NaN;

  if (!clientId || !isValidCuid(clientId)) return apiError("VALIDATION_ERROR", "Valid clientId is required", 400);
  if (!invoiceNumber) return apiError("VALIDATION_ERROR", "invoiceNumber is required", 400);
  if (!Number.isFinite(amount) || amount < 0) return apiError("VALIDATION_ERROR", "Valid amount is required", 400);

  const client = await prisma.crmClient.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return apiError("NOT_FOUND", "Client not found", 404);

  const statusRaw = typeof body.status === "string" ? body.status : "DRAFT";
  const status = VALID_STATUSES.includes(statusRaw as CrmInvoiceStatus)
    ? (statusRaw as CrmInvoiceStatus)
    : "DRAFT";

  const invoice = await prisma.crmInvoice.create({
    data: {
      clientId,
      invoiceNumber,
      amount,
      currency: typeof body.currency === "string" ? body.currency.trim() || "INR" : "INR",
      status,
      closureId: typeof body.closureId === "string" && isValidCuid(body.closureId) ? body.closureId : null,
      dueDate:
        typeof body.dueDate === "string" && body.dueDate.trim()
          ? new Date(body.dueDate)
          : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    },
  });

  return NextResponse.json(invoice, { status: 201 });
}
