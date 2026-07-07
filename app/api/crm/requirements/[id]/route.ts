import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import type { CrmRequirementStatus } from "@prisma/client";

const VALID_STATUSES: CrmRequirementStatus[] = [
  "DRAFT",
  "OPEN",
  "ON_HOLD",
  "FILLED",
  "CANCELLED",
];

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/crm/requirements/[id] — update requirement status, description, etc. */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageCrm);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id || !isValidCuid(id)) return apiError("INVALID_ID", "Malformed requirement id", 400);

  const requirement = await prisma.crmRequirement.findUnique({ where: { id } });
  if (!requirement) return apiError("NOT_FOUND", "Requirement not found", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const data: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    const status = body.status.trim() as CrmRequirementStatus;
    if (!VALID_STATUSES.includes(status)) {
      return apiError(
        "VALIDATION_ERROR",
        `status must be one of: ${VALID_STATUSES.join(", ")}`,
        400
      );
    }
    data.status = status;
  }

  if (typeof body.description === "string") {
    data.description = body.description.trim() || null;
  }

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }

  if (body.feeAmount !== undefined) {
    data.feeAmount =
      body.feeAmount !== null && body.feeAmount !== "" ? Number(body.feeAmount) : null;
  }

  if (Object.keys(data).length === 0) {
    return apiError("VALIDATION_ERROR", "No updatable fields provided", 400);
  }

  data.updatedById = auth.session.user?.id ?? null;

  const updated = await prisma.crmRequirement.update({
    where: { id },
    data,
    include: {
      client: { select: { id: true, name: true } },
      job: { select: { id: true, title: true, status: true } },
    },
  });

  return NextResponse.json(updated);
}
