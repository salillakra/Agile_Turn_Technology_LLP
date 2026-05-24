import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canSetJobStatusTo } from "@/src/lib/rbac";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import type { JobStatus } from "@prisma/client";

const ALLOWED: JobStatus[] = ["OPEN", "PAUSED", "CLOSED"];

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/jobs/[id]/status — update job status. RECRUITER can pause; only ADMIN can close. Closed jobs cannot be reopened. */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role ?? "";
  const userId = typeof session.user?.id === "string" ? session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!(await canAccessJobByScope(role, userId, id))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body.status;
  const newStatus =
    typeof raw === "string" && (ALLOWED as string[]).includes(raw) ? (raw as JobStatus) : null;
  if (!newStatus) {
    return NextResponse.json(
      { error: "status is required and must be one of: OPEN, PAUSED, CLOSED" },
      { status: 400 }
    );
  }

  if (!canSetJobStatusTo(role, newStatus)) {
    return NextResponse.json(
      { error: "You do not have permission to change job status." },
      { status: 403 }
    );
  }

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status === "CLOSED" && newStatus !== "CLOSED") {
    return NextResponse.json(
      { error: "Cannot reopen a closed job" },
      { status: 403 }
    );
  }

  const updated = await prisma.job.update({
    where: { id },
    data: { status: newStatus },
  });
  return NextResponse.json(updated);
}
