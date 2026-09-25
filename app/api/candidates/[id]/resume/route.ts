import { createHash } from "node:crypto";
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
  candidateResumeDbFields,
  deleteResumeFile,
  getResumeFile,
  getResumeStorageFileNameFromResumeUrl,
  headResumeFile,
  putResumeFile,
  tryRemovePreviousResumeFile,
  tryRemoveResumeObjectKey,
} from "@/src/lib/resume-storage";
import { enqueueCandidateEmbedding } from "@/src/lib/enqueue-entity-embedding";
import { enqueueResumeParseForCandidate } from "@/src/lib/enqueue-resume-parse";
import { invalidateCandidateEmbedding } from "@/src/lib/candidate-embedding-sync";
import {
  getMaxResumeBytes,
  RESUME_FILE_TOO_LARGE_MESSAGE,
  validateResumeFile,
  validateResumeUploadMeta,
} from "@/src/lib/resume-upload-validation";
import { consumeApiRateLimit, rateLimitedResponse, readRateLimitConfig } from "@/src/lib/api-rate-limit";
import { buildResumeObjectKey, resumeKeyBelongsToCandidate } from "@/src/lib/storage/object-keys";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function notFoundNoResume(): NextResponse {
  return apiError("NOT_FOUND", "No resume on file for this candidate", 404);
}

function resolveResumeKey(row: {
  resumeObjectKey: string | null;
  resumeUrl: string | null;
}): string | null {
  if (row.resumeObjectKey) return row.resumeObjectKey;
  if (row.resumeUrl) return getResumeStorageFileNameFromResumeUrl(row.resumeUrl);
  return null;
}

/**
 * GET /api/candidates/[id]/resume
 *
 * Downloads the candidate's resume (authenticated). Uses `resumeObjectKey` / `resumeUrl`.
 * `Content-Disposition: attachment` triggers download in browsers.
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
    select: { resumeUrl: true, resumeFileName: true, resumeObjectKey: true },
  });

  if (!candidate) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const storageKey = resolveResumeKey(candidate);
  if (!storageKey) {
    return notFoundNoResume();
  }

  const buf = await getResumeFile(storageKey);
  if (!buf) {
    return notFoundNoResume();
  }

  const downloadName = sanitizeContentDispositionFilename(
    candidate.resumeFileName?.trim() || storageKey.split("/").pop() || "resume"
  );

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mimeFromResumeFileName(storageKey),
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function attachResumeAndEnqueue(params: {
  candidateId: string;
  userId: string | undefined;
  objectKey: string;
  originalFileName: string;
  contentType: string;
  size: number;
  checksum: string | null;
  previousResumeUrl: string | null;
  previousObjectKey: string | null;
}): Promise<NextResponse> {
  const resumeUrl = candidateResumeDbFields({
    objectKey: params.objectKey,
    originalFileName: params.originalFileName,
    contentType: params.contentType,
    size: params.size,
    checksum: params.checksum,
  }).resumeUrl;

  let updated;
  try {
    updated = await prisma.candidate.update({
      where: { id: params.candidateId },
      data: candidateResumeDbFields({
        objectKey: params.objectKey,
        originalFileName: params.originalFileName,
        contentType: params.contentType,
        size: params.size,
        checksum: params.checksum,
      }),
      include: candidateDetailInclude,
    });
  } catch (e) {
    try {
      await deleteResumeFile(params.objectKey);
    } catch {
      // ignore rollback failure
    }
    throw e;
  }

  if (params.previousObjectKey && params.previousObjectKey !== params.objectKey) {
    await tryRemoveResumeObjectKey(params.previousObjectKey);
  } else {
    await tryRemovePreviousResumeFile(params.previousResumeUrl);
  }

  if (params.previousResumeUrl !== resumeUrl) {
    try {
      await invalidateCandidateEmbedding(params.candidateId);
      void enqueueCandidateEmbedding(params.candidateId).catch((err) => {
        console.error(
          "[candidates/[id]/resume] embedding enqueue failed for %s:",
          params.candidateId,
          err
        );
      });
    } catch (err) {
      console.error(
        "[candidates/[id]/resume] invalidate embedding failed for %s:",
        params.candidateId,
        err
      );
    }
  }

  const parseEnqueue = await enqueueResumeParseForCandidate({
    candidateId: params.candidateId,
    resumeUrl,
    userId: params.userId ?? null,
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

/**
 * POST /api/candidates/[id]/resume
 *
 * Multipart `file` (proxy through API) **or** JSON `{ objectKey, originalFileName, contentType, size }`
 * after a presigned PUT to object storage.
 *
 * **RBAC:** `canUploadResume` — ADMIN and RECRUITER only.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiAuth(canUploadResume);
  if (auth instanceof NextResponse) return auth;
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

  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, resumeUrl: true, resumeObjectKey: true },
  });
  if (!existing) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const previousResumeUrl = existing.resumeUrl;
  const previousObjectKey = existing.resumeObjectKey;
  const contentTypeHeader = request.headers.get("content-type") ?? "";

  if (contentTypeHeader.toLowerCase().includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (body == null) {
      return apiError("BAD_REQUEST", "Expected JSON body.", 400);
    }
    const objectKey = typeof body.objectKey === "string" ? body.objectKey.trim() : "";
    const originalFileName =
      typeof body.originalFileName === "string" ? body.originalFileName : "upload";
    const mimeType = typeof body.contentType === "string" ? body.contentType : "";
    const size = typeof body.size === "number" ? body.size : Number(body.size);
    const checksum =
      typeof body.checksum === "string" && /^[a-f0-9]{64}$/i.test(body.checksum)
        ? body.checksum.toLowerCase()
        : null;

    const meta = validateResumeUploadMeta({
      originalName: originalFileName,
      mimeType,
      size: Number.isFinite(size) ? size : 0,
    });
    if (meta.ok === false) {
      return apiError(meta.code, meta.message, 400);
    }
    if (!resumeKeyBelongsToCandidate(objectKey, id)) {
      return apiError("INVALID_OBJECT_KEY", "objectKey does not belong to this candidate.", 400);
    }

    const head = await headResumeFile(objectKey);
    if (!head) {
      return apiError("NOT_FOUND", "Uploaded object was not found in storage.", 404);
    }
    if (head.contentLength != null && head.contentLength !== size) {
      return apiError("SIZE_MISMATCH", "Uploaded object size does not match metadata.", 400);
    }

    return attachResumeAndEnqueue({
      candidateId: id,
      userId,
      objectKey,
      originalFileName,
      contentType: mimeFromResumeFileName(objectKey),
      size: head.contentLength ?? size,
      checksum,
      previousResumeUrl,
      previousObjectKey,
    });
  }

  if (!contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
    return apiError(
      "INVALID_CONTENT_TYPE",
      "Expected multipart/form-data with a file field named \"file\", or JSON metadata after presign.",
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

  const objectKey = buildResumeObjectKey({ candidateId: id, ext: validated.ext });

  try {
    await putResumeFile(objectKey, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Write failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[candidates/[id]/resume] putResumeFile", e);
    }
    return apiError("WRITE_FAILED", "Could not save file to storage.", 500, { reason: msg });
  }

  return attachResumeAndEnqueue({
    candidateId: id,
    userId,
    objectKey,
    originalFileName,
    contentType: mimeFromResumeFileName(objectKey),
    size: buffer.length,
    checksum: createHash("sha256").update(buffer).digest("hex"),
    previousResumeUrl,
    previousObjectKey,
  });
}
