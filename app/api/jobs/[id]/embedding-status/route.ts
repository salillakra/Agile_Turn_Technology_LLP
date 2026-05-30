import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { getEmbeddingJobStatus } from "@/src/lib/embedding-job-status";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/jobs/[id]/embedding-status
 *
 * Queue observability for job semantic embedding (`EmbeddingJob` row).
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id?.trim() || !isValidCuid(id)) {
    return apiError("INVALID_ID", "Malformed job id", 400);
  }

  if (!(await canAccessJobByScope(role, userId, id))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  const row = await getEmbeddingJobStatus({ entityType: "job", entityId: id });

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
