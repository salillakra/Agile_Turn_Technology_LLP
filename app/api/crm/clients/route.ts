import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrmAccounts, canViewCrm } from "@/src/lib/crm/crm-rbac";
import { buildCrmClientVisibilityWhere } from "@/src/lib/crm/crm-scope";
import { prisma } from "@/src/lib/prisma";
import type { CrmClientStatus } from "@prisma/client";

const VALID_STATUSES: CrmClientStatus[] = ["ACTIVE", "INACTIVE"];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/crm/clients */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCrm);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = auth.session.user?.id;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const scope = buildCrmClientVisibilityWhere(role, userId);
  const [total, rows] = await Promise.all([
    prisma.crmClient.count({ where: scope }),
    prisma.crmClient.findMany({
      where: scope,
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        accountOwner: { select: { id: true, name: true, email: true } },
        _count: { select: { requirements: true, contacts: true, invoices: true } },
      },
    }),
  ]);

  return NextResponse.json({ data: rows, page, limit, total });
}

/** POST /api/crm/clients */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canManageCrmAccounts);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return apiError("VALIDATION_ERROR", "name is required", 400);

  const statusRaw = typeof body.status === "string" ? body.status : "ACTIVE";
  const status = VALID_STATUSES.includes(statusRaw as CrmClientStatus)
    ? (statusRaw as CrmClientStatus)
    : "ACTIVE";

  const client = await prisma.crmClient.create({
    data: {
      name,
      industry: typeof body.industry === "string" ? body.industry.trim() || null : null,
      website: typeof body.website === "string" ? body.website.trim() || null : null,
      billingEmail: typeof body.billingEmail === "string" ? body.billingEmail.trim() || null : null,
      billingAddress: typeof body.billingAddress === "string" ? body.billingAddress.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      status,
      accountOwnerId:
        typeof body.accountOwnerId === "string"
          ? body.accountOwnerId
          : auth.session.user?.id ?? null,
    },
  });

  return NextResponse.json(client, { status: 201 });
}
