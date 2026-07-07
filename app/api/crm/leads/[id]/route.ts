import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import type { CrmLeadStatus } from "@prisma/client";

const VALID_STATUSES: CrmLeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/crm/leads/[id] — update lead fields (status, notes, expectedValue, etc.). */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageCrm);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id || !isValidCuid(id)) return apiError("INVALID_ID", "Malformed lead id", 400);

  const lead = await prisma.crmLead.findUnique({ where: { id } });
  if (!lead) return apiError("NOT_FOUND", "Lead not found", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const data: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    const status = body.status.trim() as CrmLeadStatus;
    if (!VALID_STATUSES.includes(status)) {
      return apiError(
        "VALIDATION_ERROR",
        `status must be one of: ${VALID_STATUSES.join(", ")}`,
        400
      );
    }
    // Prevent re-converting already-converted leads via status patch (use /convert route instead)
    if (status === "CONVERTED" && lead.convertedClientId) {
      return apiError("CONFLICT", "Use /convert to convert a lead to a client", 409);
    }
    data.status = status;
  }

  if (typeof body.notes === "string") {
    data.notes = body.notes.trim() || null;
  }

  if (body.expectedValue !== undefined) {
    data.expectedValue =
      body.expectedValue !== null && body.expectedValue !== ""
        ? Number(body.expectedValue)
        : null;
  }

  if (Object.keys(data).length === 0) {
    return apiError("VALIDATION_ERROR", "No updatable fields provided", 400);
  }

  const updated = await prisma.crmLead.update({
    where: { id },
    data,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      convertedClient: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}
