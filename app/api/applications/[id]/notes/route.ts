import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate } from "@/src/lib/rbac";
import { validateApplicationText } from "@/src/lib/application-text-limits";
import { apiError } from "@/src/lib/api-error-response";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";
import { prisma } from "@/src/lib/prisma";
import {
  buildNotesUpdatedDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/applications/[id]/notes — update application notes. Creates ActivityLog NOTES_UPDATED. ADMIN and RECRUITER only. */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const actorUserId = typeof session.user?.id === "string" ? session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return apiError("VALIDATION_ERROR", "Missing id", 400);
  if (!isValidCuid(id)) return apiError("INVALID_ID", "Malformed ID format", 400);

  const application = await prisma.application.findUnique({
    where: { id },
    select: { id: true, jobId: true },
  });
  if (!application) {
    return apiError("NOT_FOUND", "Application not found", 404);
  }
  if (!(await canAccessJobByScope(role, actorUserId, application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this application", 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const notesRaw = body.notes;
  const notes =
    notesRaw === undefined
      ? undefined
      : typeof notesRaw === "string"
        ? notesRaw.trim() || null
        : null;

  if (notes === undefined) {
    return apiError("VALIDATION_ERROR", "notes is required (string or null)", 400);
  }

  const notesError = validateApplicationText("notes", notes);
  if (notesError) {
    return apiError(notesError.code, notesError.message, 400);
  }

  const notesDetailsSerialized = serializeActivityLogDetails(
    buildNotesUpdatedDetails("Updated application notes")
  );
  if (notesDetailsSerialized.ok === false) {
    return apiError(
      notesDetailsSerialized.code,
      notesDetailsSerialized.message,
      400
    );
  }

  const userId = session.user?.id;

  const updated = await prisma.$transaction(async (tx) => {
    const refreshed = await tx.application.update({
      where: { id },
      data: { notes, version: { increment: 1 } },
      include: { candidate: true, job: true },
    });

    if (typeof userId === "string") {
      await tx.activityLog.create({
        data: {
          applicationId: id,
          userId,
          action: "NOTES_UPDATED",
          details: notesDetailsSerialized.json,
        },
      });
    }

    return refreshed;
  });

  return NextResponse.json(updated);
}
