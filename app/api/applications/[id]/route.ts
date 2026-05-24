import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate, canViewCandidates } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { checkApplicationMutationRateLimit } from "@/src/lib/rate-limit";
import { isValidCuid } from "@/src/lib/validate-id";
import { prisma } from "@/src/lib/prisma";
import {
  buildApplicationDeletedDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";

type RouteContext = { params: Promise<{ id: string }> };

function parseActivityDetails(details: string | null): unknown {
  if (details == null) return null;
  try {
    return JSON.parse(details);
  } catch {
    return { text: details };
  }
}

/** GET /api/applications/[id] — full application details with candidate profile and job. Optional ?includeActivityLogs=true to include activityLogs (with user). 404 if not found. */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return apiError("VALIDATION_ERROR", "Missing id", 400);
  if (!isValidCuid(id)) return apiError("INVALID_ID", "Malformed ID format", 400);

  const includeActivityLogs =
    new URL(request.url).searchParams.get("includeActivityLogs") === "true";

  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      candidate: true,
      job: true,
      ...(includeActivityLogs && {
        activityLogs: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      }),
    },
  });

  if (!application) {
    return apiError("NOT_FOUND", "Application not found", 404);
  }
  if (!(await canAccessJobByScope(role, userId, application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this application", 403);
  }

  if (includeActivityLogs && (application as { activityLogs?: unknown[] }).activityLogs) {
    const activityLogs = (application as any).activityLogs.map((l: any) => ({
      ...l,
      details: parseActivityDetails(l.details),
    }));
    return NextResponse.json({ ...application, activityLogs });
  }

  return NextResponse.json(application);
}

/** PUT /api/applications/[id] — disabled (405). Use PATCH /api/applications/[id]/stage, /feedback, /notes for updates. */
export async function PUT(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return apiError(
    "METHOD_NOT_ALLOWED",
    "Use PATCH /api/applications/[id]/stage, /feedback, or /notes for updates.",
    405
  );
}

/**
 * DELETE /api/applications/[id] — withdraw application (soft delete). Sets withdrawnAt and optional withdrawnReason.
 * Auth: canEditCandidate. HIRED applications cannot be withdrawn (409). Already withdrawn returns 409. Returns 204 on success.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const actorUserId = typeof session.user?.id === "string" ? session.user.id : undefined;

  const rateLimitRes = checkApplicationMutationRateLimit(session.user?.id);
  if (rateLimitRes) return rateLimitRes;

  const { id } = await context.params;
  if (!id) return apiError("VALIDATION_ERROR", "Missing id", 400);
  if (!isValidCuid(id)) return apiError("INVALID_ID", "Malformed ID format", 400);

  const application = await prisma.application.findUnique({
    where: { id },
    select: { id: true, stage: true, withdrawnAt: true, jobId: true },
  });
  if (!application) {
    return apiError("NOT_FOUND", "Application not found", 404);
  }
  if (!(await canAccessJobByScope(role, actorUserId, application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this application", 403);
  }

  if (application.withdrawnAt != null) {
    return apiError("CONFLICT", "Application is already withdrawn", 409);
  }

  if (application.stage === "HIRED") {
    return apiError("CONFLICT", "Applications in HIRED stage cannot be withdrawn", 409);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const withdrawnReason =
    typeof body.withdrawnReason === "string" ? body.withdrawnReason.trim() || null : null;

  const deletedDetailsSerialized = serializeActivityLogDetails(
    buildApplicationDeletedDetails(withdrawnReason)
  );
  if (deletedDetailsSerialized.ok === false) {
    return apiError(
      deletedDetailsSerialized.code,
      deletedDetailsSerialized.message,
      400
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id },
      data: {
        withdrawnAt: new Date(),
        withdrawnReason,
        version: { increment: 1 },
      },
    });

    const userId = session.user?.id;
    if (typeof userId === "string") {
      await tx.activityLog.create({
        data: {
          applicationId: id,
          userId,
          action: "APPLICATION_DELETED",
          details: deletedDetailsSerialized.json,
        },
      });
    }
  });
  return new NextResponse(null, { status: 204 });
}
