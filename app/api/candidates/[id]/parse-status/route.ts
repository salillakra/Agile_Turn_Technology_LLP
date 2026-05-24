import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canUploadResume, canViewCandidates } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import type { ResumeParseJobStatus } from "@prisma/client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export type ParseStatusResponseBody = {
  /** Latest job id (for POST .../resume/parse/apply). */
  resumeParseJobId: string | null;
  status: ResumeParseJobStatus | null;
  result: unknown | null;
  error: string | null;
};

/**
 * GET /api/candidates/[id]/parse-status
 *
 * Returns the **latest** `ResumeParseJob` for this candidate (by `createdAt` desc).
 * If none exist, `status` / `result` / `error` are `null`.
 *
 * **RBAC:** `canViewCandidates` — ADMIN, RECRUITER, HIRING_MANAGER.
 */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("VALIDATION_ERROR", "Missing candidate id", 400);
  }
  if (!isValidCuid(id)) {
    return apiError("INVALID_ID", "Malformed candidate id", 400);
  }

  const candidateExists = await prisma.candidate.findFirst({
    where: canUploadResume(role) ? { id } : { id, ...buildCandidateVisibilityWhere(role, userId) },
    select: { id: true },
  });
  if (!candidateExists) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const job = await prisma.resumeParseJob.findFirst({
    where: { candidateId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      resultJson: true,
      error: true,
    },
  });

  const body: ParseStatusResponseBody = job
    ? {
        resumeParseJobId: job.id,
        status: job.status,
        result: job.resultJson === null ? null : job.resultJson,
        error: job.error ?? null,
      }
    : {
        resumeParseJobId: null,
        status: null,
        result: null,
        error: null,
      };

  return NextResponse.json(body);
}
