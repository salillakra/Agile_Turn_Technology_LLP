import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canManageRecruiterAssignments } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/** DELETE /api/jobs/[id]/assignments/[userId] — ADMIN-only audit removal. */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageRecruiterAssignments);
  if (auth instanceof NextResponse) return auth;

  const { id: jobId, userId } = await context.params;
  if (!jobId || !userId) return NextResponse.json({ error: "Missing id or userId" }, { status: 400 });
  if (!isValidCuid(jobId)) return NextResponse.json({ error: "Malformed id format" }, { status: 400 });
  if (!isValidCuid(userId)) return NextResponse.json({ error: "Malformed userId format" }, { status: 400 });

  const deleted = await prisma.jobAssignment.deleteMany({
    where: { jobId, userId },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
