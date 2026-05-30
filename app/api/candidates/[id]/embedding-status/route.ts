import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { getEmbeddingJobStatus } from "@/src/lib/embedding-job-status";
import { canViewCandidates } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/candidates/[id]/embedding-status
 *
 * Queue observability for candidate semantic embedding (`EmbeddingJob` row).
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id?.trim() || !isValidCuid(id)) {
    return apiError("INVALID_ID", "Malformed candidate id", 400);
  }

  const candidate = await prisma.candidate.findFirst({
    where: { id, ...buildCandidateVisibilityWhere(role, userId) },
    select: { id: true },
  });
  if (!candidate) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const row = await getEmbeddingJobStatus({ entityType: "candidate", entityId: id });

  return NextResponse.json(
    row
      ? {
          embeddingJobId: row.id,
          status: row.status,
          error: row.error,
          bullmqJobId: row.bullmqJobId,
          attemptCount: row.attemptCount,
          startedAt: row.startedAt?.toISOString() ?? null,
          completedAt: row.completedAt?.toISOString() ?? null,
          failedAt: row.failedAt?.toISOString() ?? null,
          updatedAt: row.updatedAt.toISOString(),
        }
      : {
          embeddingJobId: null,
          status: null,
          error: null,
          bullmqJobId: null,
          attemptCount: null,
          startedAt: null,
          completedAt: null,
          failedAt: null,
          updatedAt: null,
        }
  );
}
