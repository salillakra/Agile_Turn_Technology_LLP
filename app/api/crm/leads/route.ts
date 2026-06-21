import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrm, canViewCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import type { CrmLeadStatus } from "@prisma/client";

const VALID_STATUSES: CrmLeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/crm/leads — list CRM leads. */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCrm);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const where: { status?: CrmLeadStatus } = {};
  if (statusRaw && VALID_STATUSES.includes(statusRaw as CrmLeadStatus)) {
    where.status = statusRaw as CrmLeadStatus;
  }

  const [total, rows] = await Promise.all([
    prisma.crmLead.count({ where }),
    prisma.crmLead.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        convertedClient: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({ data: rows, page, limit, total });
}

/** POST /api/crm/leads — create lead. */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canManageCrm);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
  if (!companyName || !contactName) {
    return apiError("VALIDATION_ERROR", "companyName and contactName are required", 400);
  }

  const statusRaw = typeof body.status === "string" ? body.status : "NEW";
  const status = VALID_STATUSES.includes(statusRaw as CrmLeadStatus) ? (statusRaw as CrmLeadStatus) : "NEW";

  const lead = await prisma.crmLead.create({
    data: {
      companyName,
      contactName,
      email: typeof body.email === "string" ? body.email.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      source: typeof body.source === "string" ? body.source.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      status,
      expectedValue:
        body.expectedValue != null && body.expectedValue !== "" ? Number(body.expectedValue) : null,
      ownerId: typeof body.ownerId === "string" ? body.ownerId : auth.session.user?.id ?? null,
    },
  });

  return NextResponse.json(lead, { status: 201 });
}
