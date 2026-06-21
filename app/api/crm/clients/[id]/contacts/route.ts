import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrm, canViewCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/crm/clients/[id]/contacts */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCrm);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id || !isValidCuid(id)) return apiError("INVALID_ID", "Malformed id", 400);

  const contacts = await prisma.crmContact.findMany({
    where: { clientId: id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ data: contacts });
}

/** POST /api/crm/clients/[id]/contacts */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageCrm);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id || !isValidCuid(id)) return apiError("INVALID_ID", "Malformed id", 400);

  const client = await prisma.crmClient.findUnique({ where: { id }, select: { id: true } });
  if (!client) return apiError("NOT_FOUND", "Client not found", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return apiError("VALIDATION_ERROR", "name is required", 400);

  const contact = await prisma.crmContact.create({
    data: {
      clientId: id,
      name,
      email: typeof body.email === "string" ? body.email.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      title: typeof body.title === "string" ? body.title.trim() || null : null,
      isPrimary: body.isPrimary === true,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
