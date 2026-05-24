import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageRecruiterAssignments } from "@/src/lib/rbac";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/** DELETE /api/jobs/[id]/assignments/[userId] — remove assignment from job. ADMIN + scoped HIRING_MANAGER. */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageRecruiterAssignments);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const actorUserId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id: jobId, userId } = await context.params;
  if (!jobId || !userId) return NextResponse.json({ error: "Missing id or userId" }, { status: 400 });
  if (!isValidCuid(jobId)) return NextResponse.json({ error: "Malformed id format" }, { status: 400 });
  if (!isValidCuid(userId)) return NextResponse.json({ error: "Malformed userId format" }, { status: 400 });
  if (!(await canAccessJobByScope(role, actorUserId, jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  const deleted = await prisma.jobAssignment.deleteMany({
    where: { jobId, userId },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

