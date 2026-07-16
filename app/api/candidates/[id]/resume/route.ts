import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canReadResume, canUploadResume } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { mimeFromResumeFileName, sanitizeContentDispositionFilename } from "@/src/lib/resume-mime";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import {
  candidateDetailInclude,
  formatCandidateDetail,
} from "@/src/lib/candidate-detail-response";
import {
  ensureResumeUploadDir,
  getResumeUploadDir,
  RESUME_READ_URL_PREFIX,
  safeResumeFilePath,
  tryRemovePreviousResumeFile,
} from "@/src/lib/resume-storage";
import { enqueueCandidateEmbedding } from "@/src/lib/enqueue-entity-embedding";
import { enqueueResumeParseForCandidate } from "@/src/lib/enqueue-resume-parse";
import { invalidateCandidateEmbedding } from "@/src/lib/candidate-embedding-sync";
import {
  buildStoredFileName,
  getMaxResumeBytes,
  RESUME_FILE_TOO_LARGE_MESSAGE,
  validateResumeFile,
} from "@/src/lib/resume-upload-validation";
import { consumeApiRateLimit, rateLimitedResponse, readRateLimitConfig } from "@/src/lib/api-rate-limit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function notFoundNoResume(): NextResponse {
  return apiError("NOT_FOUND", "No resume on file for this candidate", 404);
}

/**
 * GET /api/candidates/[id]/resume
 *
 * Downloads the candidate's resume (authenticated). Uses `resumeUrl` + on-disk file under
 * `uploads/resumes`. `Content-Disposition: attachment` triggers download in browsers.
 *
 * **RBAC:** `canReadResume` — ADMIN, RECRUITER, and HIRING_MANAGER (read-only for HM).
 */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiAuth(canReadResume);
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

  const candidate = await prisma.candidate.findFirst({
    where: { id, ...buildCandidateVisibilityWhere(role, userId) },
    select: { resumeUrl: true, resumeFileName: true },
  });

  if (!candidate) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const resumeUrl = candidate.resumeUrl?.trim();
  if (!resumeUrl) {
    return notFoundNoResume();
  }

  if (!resumeUrl.startsWith(RESUME_READ_URL_PREFIX)) {
    return notFoundNoResume();
  }

  const rest = resumeUrl.slice(RESUME_READ_URL_PREFIX.length).split("/")[0] ?? "";
  if (!rest) {
    return notFoundNoResume();
  }

  let storageFileName: string;
  try {
    storageFileName = decodeURIComponent(rest);
  } catch {
    return notFoundNoResume();
  }

  const fullPath = safeResumeFilePath([storageFileName]);
  if (fullPath == null) {
    return notFoundNoResume();
  }

  ensureResumeUploadDir();

  let buf: Buffer;
  try {
    const st = await stat(fullPath);
    if (!st.isFile()) {
      return notFoundNoResume();
    }
    buf = await readFile(fullPath);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return notFoundNoResume();
    }
    throw e;
  }

  const downloadName = sanitizeContentDispositionFilename(
    candidate.resumeFileName?.trim() || storageFileName
  );

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mimeFromResumeFileName(storageFileName),
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * POST /api/candidates/[id]/resume
 *
 * Multipart form-data with field `file` (PDF, DOC, or DOCX).
 * Saves under uploads/resumes, sets `resumeUrl` + `resumeFileName`, enqueues a background parse job,
 * and returns candidate detail immediately (parsing runs in the worker — poll `GET .../parse-status`).
 *
 * **Replacement:** If the candidate already had a locally stored resume, the old file is deleted **after**
 * the new file is written and the DB row is updated — so a failed write/update does not remove the prior file.
 *
 * **RBAC:** `canUploadResume` — ADMIN and RECRUITER only (upload/replace/delete previous file). HIRING_MANAGER → 403.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiAuth(canUploadResume);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const cfg = readRateLimitConfig({
    maxEnv: "RESUME_UPLOAD_RATE_MAX",
    windowMsEnv: "RESUME_UPLOAD_RATE_WINDOW_MS",
    defaultMax: 5,
    defaultWindowMs: 60_000,
  });
  const limited = await consumeApiRateLimit({
    prefix: "recruitment:resume:ratelimit:v1:",
    scope: "candidate-upload",
    identity: userId ?? "",
    max: cfg.max,
    windowMs: cfg.windowMs,
  });
  if (limited.ok === false) {
    return rateLimitedResponse({
      message: "Too many resume uploads. Try again later.",
      retryAfterSeconds: limited.retryAfterSeconds,
      limit: cfg.max,
      windowSeconds: Math.round(cfg.windowMs / 1000),
    });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("VALIDATION_ERROR", "Missing candidate id", 400);
  }
  if (!isValidCuid(id)) {
    return apiError("INVALID_ID", "Malformed candidate id", 400);
  }

  // NOTE: For resume upload we allow ADMIN/RECRUITER (canUploadResume) to access candidate by id
  // without assigned-job scope. Newly created candidates have no applications yet, so scope would hide them.
  // GET /resume remains scoped via buildCandidateVisibilityWhere.
  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, resumeUrl: true },
  });
  if (!existing) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  /** Prior `resumeUrl` from DB; used to delete old on-disk file only after successful replace. */
  const previousResumeUrl = existing.resumeUrl;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return apiError(
      "INVALID_CONTENT_TYPE",
      "Expected multipart/form-data with a file field named \"file\".",
      400
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("BAD_REQUEST", "Could not parse multipart body.", 400);
  }

  const entry = formData.get("file");
  if (entry == null || typeof entry === "string") {
    return apiError("VALIDATION_ERROR", "Missing file field \"file\".", 400);
  }

  const file = entry as File;
  const originalFileName = typeof file.name === "string" ? file.name : "upload";
  const mimeType = typeof file.type === "string" ? file.type : "";

  const maxBytes = getMaxResumeBytes();
  if (file.size > maxBytes) {
    return apiError("FILE_TOO_LARGE", RESUME_FILE_TOO_LARGE_MESSAGE, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const validated = validateResumeFile({
    originalName: originalFileName,
    mimeType,
    buffer,
  });
  if (validated.ok === false) {
    return apiError(validated.code, validated.message, 400);
  }

  ensureResumeUploadDir();
  const storedName = buildStoredFileName(validated.ext);
  const absolutePath = path.join(getResumeUploadDir(), storedName);
  const resumeUrl = `${RESUME_READ_URL_PREFIX}${encodeURIComponent(storedName)}`;

  try {
    await writeFile(absolutePath, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Write failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[candidates/[id]/resume] writeFile", e);
    }
    return apiError("WRITE_FAILED", "Could not save file to disk.", 500, { reason: msg });
  }

  let updated;
  try {
    updated = await prisma.candidate.update({
      where: { id },
      data: {
        resumeUrl,
        resumeFileName: originalFileName,
      },
      include: candidateDetailInclude,
    });
  } catch (e) {
    try {
      const fs = await import("node:fs/promises");
      await fs.unlink(absolutePath);
    } catch {
      // ignore rollback failure
    }
    throw e;
  }

  // Replace: remove previous local file only after DB points at the new object (avoids losing the old file on failed write/update).
  await tryRemovePreviousResumeFile(previousResumeUrl);

  if (previousResumeUrl !== resumeUrl) {
    try {
      await invalidateCandidateEmbedding(id);
      void enqueueCandidateEmbedding(id).catch((e) => {
        console.error("[candidates/[id]/resume] embedding enqueue failed for %s:", id, e);
      });
    } catch (e) {
      console.error("[candidates/[id]/resume] invalidate embedding failed for %s:", id, e);
    }
  }

  const parseEnqueue = await enqueueResumeParseForCandidate({
    candidateId: id,
    resumeUrl,
    userId: userId ?? null,
    forceNewJob: true,
  });

  const detail = formatCandidateDetail(updated);

  return NextResponse.json(
    {
      ...detail,
      resumeParse:
        parseEnqueue.ok === true
          ? {
              enqueued: true,
              idempotent: parseEnqueue.idempotent,
              processing: parseEnqueue.processing,
              bullmqJobId: parseEnqueue.bullmqJobId,
              job: parseEnqueue.job,
            }
          : {
              enqueued: false,
              error: parseEnqueue.message,
              code: parseEnqueue.code,
            },
    },
    { status: 201 }
  );
}
