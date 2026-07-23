import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { enqueueResumeParseForCandidate } from "@/src/lib/enqueue-resume-parse";
import { canUploadResume } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { executeResumeParseJob } from "@/src/lib/process-pending-parse-jobs";
import { markResumeParseJobProcessing } from "@/src/lib/resume-parse-job-status";
import { isResumeParseReady } from "@/src/lib/queue-job-status";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/candidates/[id]/resume/parse
 *
 * Enqueues resume parsing on BullMQ (`resumeParsingQueue`). Returns immediately;
 * the worker updates `ResumeParseJob` (poll `GET .../parse-status`).
 *
 * **Idempotency:** Same `fileHash` returns the existing job (re-queues if still PENDING).
 * **Query `force=1`:** Always create a new `ResumeParseJob` row.
 * **Query `sync=1`:** Run parse inline in this request (for apply flow; no worker required).
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
  const syncRaw = searchParams.get("sync")?.trim().toLowerCase() ?? "";
  const syncInline = syncRaw === "1" || syncRaw === "true" || syncRaw === "yes";

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("VALIDATION_ERROR", "Missing candidate id", 400);
  }
  if (!isValidCuid(id)) {
    return apiError("INVALID_ID", "Malformed candidate id", 400);
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, resumeUrl: true, candidateName: true },
  });

  if (!candidate) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const resumeUrl = candidate.resumeUrl?.trim();
  if (!resumeUrl) {
    return apiError(
      "NO_RESUME",
      "Candidate has no uploaded resume; upload a file before requesting parse.",
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

  if (syncInline && !isResumeParseReady(result.job.status)) {
    await markResumeParseJobProcessing(prisma, {
      jobId: result.job.id,
      attemptCount: 1,
      candidateId: id,
    });
    const run = await executeResumeParseJob(
      prisma,
      {
        id: result.job.id,
        candidateId: id,
        fileHash: result.job.fileHash,
        llmRetryCount: 0,
      },
      {
        resumeUrl,
        candidateName: candidate.candidateName ?? "",
      }
    );
    if (run.outcome === "failed") {
      return apiError("PARSE_FAILED", run.error, 500);
    }
    const refreshed = await prisma.resumeParseJob.findUnique({
      where: { id: result.job.id },
      select: {
        id: true,
        candidateId: true,
        status: true,
        fileHash: true,
        resultJson: true,
        error: true,
        bullmqJobId: true,
        attemptCount: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!refreshed) {
      return apiError("NOT_FOUND", "Parse job not found after sync run", 404);
    }
    return NextResponse.json(
      {
        message: "Parse completed inline.",
        sync: true,
        idempotent: result.idempotent,
        job: refreshed,
        resumeParseJobId: refreshed.id,
        status: refreshed.status,
        result: refreshed.resultJson,
        error: refreshed.error,
      },
      { status: 200, headers: { "X-Resume-Parse-Processing": "sync" } }
    );
  }

  if (syncInline && isResumeParseReady(result.job.status)) {
    return NextResponse.json(
      {
        message: "Parse already complete.",
        sync: true,
        idempotent: true,
        job: result.job,
        resumeParseJobId: result.job.id,
        status: result.job.status,
        result: result.job.resultJson,
        error: result.job.error,
      },
      { status: 200, headers: { "X-Resume-Parse-Processing": "sync" } }
    );
  }

  const status = result.idempotent ? 200 : 201;
  const message = result.idempotent
    ? "Same resume file as a previous parse; returning existing job."
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
