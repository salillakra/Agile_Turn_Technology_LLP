import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { enqueueResumeParseForCandidate } from "@/src/lib/enqueue-resume-parse";
import { canUploadResume } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/candidates/[id]/resume/parse
 *
 * Enqueues résumé parsing on BullMQ (`resumeParsingQueue`). Returns immediately;
 * the worker updates `ResumeParseJob` (poll `GET .../parse-status`).
 *
 * **Idempotency:** Same `fileHash` returns the existing job (re-queues if still PENDING).
 * **Query `force=1`:** Always create a new `ResumeParseJob` row.
 *
 * **RBAC:** `canUploadResume` — ADMIN and RECRUITER only.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiAuth(canUploadResume);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const userId = typeof session.user?.id === "string" ? session.user.id : null;

  const { searchParams } = new URL(request.url);
  const forceRaw = searchParams.get("force")?.trim().toLowerCase() ?? "";
  const forceNewJob = forceRaw === "1" || forceRaw === "true" || forceRaw === "yes";

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("VALIDATION_ERROR", "Missing candidate id", 400);
  }
  if (!isValidCuid(id)) {
    return apiError("INVALID_ID", "Malformed candidate id", 400);
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, resumeUrl: true },
  });

  if (!candidate) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const resumeUrl = candidate.resumeUrl?.trim();
  if (!resumeUrl) {
    return apiError(
      "NO_RESUME",
      "Candidate has no uploaded résumé; upload a file before requesting parse.",
      400
    );
  }

  const result = await enqueueResumeParseForCandidate({
    candidateId: id,
    resumeUrl,
    userId,
    forceNewJob,
  });

  if (result.ok === false) {
    if (result.code === "INVALID_RESUME_REFERENCE") {
      return apiError("INVALID_RESUME_REFERENCE", result.message, 400);
    }
    if (result.code === "RESUME_FILE_MISSING") {
      return apiError("RESUME_FILE_MISSING", result.message, 404);
    }
    return apiError("QUEUE_UNAVAILABLE", result.message, 503);
  }

  const status = result.idempotent ? 200 : 201;
  const message = result.idempotent
    ? "Same résumé file as a previous parse; returning existing job."
    : "Parse job enqueued; processing runs in the background worker.";

  return NextResponse.json(
    {
      message,
      idempotent: result.idempotent,
      processing: result.processing,
      bullmqJobId: result.bullmqJobId,
      job: result.job,
    },
    {
      status,
      headers:
        result.processing === "queued"
          ? { "X-Resume-Parse-Processing": "queued" }
          : { "X-Resume-Parse-Processing": "inline-fallback" },
    }
  );
}
