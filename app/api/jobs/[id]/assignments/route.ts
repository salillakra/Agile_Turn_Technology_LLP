import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageRecruiterAssignments } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/jobs/[id]/assignments — ADMIN-only audit list (no access impact). */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageRecruiterAssignments);
  if (auth instanceof NextResponse) return auth;

  const { id: jobId } = await context.params;
  if (!jobId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!isValidCuid(jobId)) return NextResponse.json({ error: "Malformed id format" }, { status: 400 });

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const assignments = await prisma.jobAssignment.findMany({
    where: { jobId },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      jobId: true,
      userId: true,
      assignedAt: true,
      assignedById: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  return NextResponse.json({ data: assignments });
}

/** POST /api/jobs/[id]/assignments — ADMIN-only audit record (HM or RECRUITER). */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canManageRecruiterAssignments);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const { id: jobId } = await context.params;
  if (!jobId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!isValidCuid(jobId)) return NextResponse.json({ error: "Malformed id format" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!isValidCuid(userId)) return NextResponse.json({ error: "Malformed userId format" }, { status: 400 });

  const [job, user] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
  ]);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.role === "ADMIN") {
    return apiError("FORBIDDEN", "Cannot assign ADMIN users to jobs", 403);
  }
  if (user.role !== "HIRING_MANAGER" && user.role !== "RECRUITER") {
    return apiError("FORBIDDEN", "Audit assignment supports HIRING_MANAGER or RECRUITER only", 403);
  }

  try {
    const assignedById = typeof session.user?.id === "string" ? session.user.id : null;
    const assignment = await prisma.jobAssignment.create({
      data: { jobId, userId, assignedById },
      select: {
        id: true,
        jobId: true,
        userId: true,
        assignedAt: true,
        assignedById: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ error: "User is already assigned to this job" }, { status: 409 });
    }
    throw error;
  }
}
