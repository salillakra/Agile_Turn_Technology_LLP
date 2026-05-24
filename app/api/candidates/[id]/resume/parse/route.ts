import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canUploadResume } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { computeResumeSha256HexFromResumeUrl } from "@/src/lib/resume-file-hash";
import { logResumeParseStarted } from "@/src/lib/resume-parse-activity-log";
import { processPendingParseJobs } from "@/src/lib/process-pending-parse-jobs";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/candidates/[id]/resume/parse
 *
 * Enqueues a résumé parse job (parsing runs in the worker: `GET|POST /api/cron/process-parse-jobs`).
 * Creates `ResumeParseJob` with status PENDING and `fileHash` = SHA-256 of the file bytes on disk
 * (resolved from `resumeUrl`).
 *
 * **Idempotency:** If a job already exists for this candidate with the same `fileHash` (unchanged
 * file), returns **200** with that job (including `resultJson` / `error`) and does **not** insert a row.
 *
 * **Query `force=1` or `force=true`:** Skip idempotency and always enqueue a **new** job (same file).
 * Use after parser upgrades or to refresh stale `resultJson` without re-uploading the file.
 *
 * **RBAC:** `canUploadResume` — ADMIN and RECRUITER only.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiAuth(canUploadResume);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
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

  // NOTE: We intentionally do not apply assigned-job scope here.
  // This endpoint is already restricted to ADMIN/RECRUITER via `canUploadResume`.
  // A newly created candidate may have no applications yet, so scope would incorrectly hide it.
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

  const hashed = await computeResumeSha256HexFromResumeUrl(resumeUrl);
  if (hashed.ok === false) {
    if (hashed.reason === "INVALID_URL") {
      return apiError(
        "INVALID_RESUME_REFERENCE",
        "Résumé URL is not a supported local storage reference.",
        400
      );
    }
    return apiError(
      "RESUME_FILE_MISSING",
      "Résumé file is missing from storage; re-upload the résumé.",
      404
    );
  }

  const existing = await prisma.resumeParseJob.findFirst({
    where: {
      candidateId: id,
      fileHash: hashed.hash,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      candidateId: true,
      status: true,
      fileHash: true,
      resultJson: true,
      error: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (existing && !forceNewJob) {
    if (existing.status === "PENDING") {
      // If a matching pending job already exists, re-kick the worker so the user
      // doesn't need to wait for scheduled cron/manual invocation.
      queueMicrotask(() => {
        void processPendingParseJobs(prisma, { limit: 1 }).catch(() => undefined);
      });
    }
    return NextResponse.json(
      {
        message: "Same résumé file as a previous parse; returning existing job and result.",
        idempotent: true,
        job: existing,
      },
      { status: 200 }
    );
  }

  const job = await prisma.resumeParseJob.create({
    data: {
      candidateId: id,
      status: "PENDING",
      fileHash: hashed.hash,
    },
    select: {
      id: true,
      candidateId: true,
      status: true,
      fileHash: true,
      resultJson: true,
      error: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await logResumeParseStarted(prisma, {
    candidateId: id,
    userId,
    resumeParseJobId: job.id,
    fileHash: job.fileHash,
  });

  // Opportunistic auto-processing: run one pending parse job in background so users
  // don't need to trigger the cron endpoint manually in development.
  queueMicrotask(() => {
    void processPendingParseJobs(prisma, { limit: 1 }).catch(() => undefined);
  });

  return NextResponse.json(
    {
      message: "Parse job enqueued; processing is asynchronous.",
      idempotent: false,
      job,
    },
    { status: 201 }
  );
}
