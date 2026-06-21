import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { activateCrmRequirement } from "@/src/lib/crm/crm-requirement-activate";
import { canManageCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/crm/requirements/[id]/activate — create linked Job (Requirement → ATS Job). */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageCrm);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.session.user?.id;
  if (typeof userId !== "string") return apiError("UNAUTHORIZED", "Not signed in", 401);

  const { id } = await context.params;
  if (!id || !isValidCuid(id)) return apiError("INVALID_ID", "Malformed id", 400);

  const requirement = await prisma.crmRequirement.findUnique({ where: { id } });
  if (!requirement) return apiError("NOT_FOUND", "Requirement not found", 404);

  try {
    const { jobId } = await activateCrmRequirement(requirement, userId);
    const updated = await prisma.crmRequirement.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        job: { select: { id: true, title: true, status: true } },
      },
    });
    return NextResponse.json({ ...updated, jobId });
  } catch (e) {
    return apiError(
      "ACTIVATION_FAILED",
      e instanceof Error ? e.message : "Could not activate requirement",
      400
    );
  }
}
