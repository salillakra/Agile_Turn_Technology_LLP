import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrmAccounts } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/crm/leads/[id]/convert — convert lead to client (Lead → Client). */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageCrmAccounts);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id || !isValidCuid(id)) return apiError("INVALID_ID", "Malformed id", 400);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientName =
    typeof body.clientName === "string" && body.clientName.trim()
      ? body.clientName.trim()
      : null;

  const lead = await prisma.crmLead.findUnique({ where: { id } });
  if (!lead) return apiError("NOT_FOUND", "Lead not found", 404);
  if (lead.status === "CONVERTED" && lead.convertedClientId) {
    return apiError("CONFLICT", "Lead already converted", 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.crmClient.create({
      data: {
        name: clientName ?? lead.companyName,
        billingEmail: lead.email,
        accountOwnerId: lead.ownerId ?? auth.session.user?.id ?? null,
        notes: lead.notes,
      },
    });

    if (lead.email || lead.phone) {
      await tx.crmContact.create({
        data: {
          clientId: client.id,
          name: lead.contactName,
          email: lead.email,
          phone: lead.phone,
          isPrimary: true,
        },
      });
    }

    await tx.crmLead.update({
      where: { id },
      data: {
        status: "CONVERTED",
        convertedClientId: client.id,
      },
    });

    return client;
  });

  return NextResponse.json(result, { status: 201 });
}
