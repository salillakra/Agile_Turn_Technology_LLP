import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canUploadResume } from "@/src/lib/rbac";
import { consumeApiRateLimit, rateLimitedResponse, readRateLimitConfig } from "@/src/lib/api-rate-limit";
import {
  ensureResumeUploadDir,
  getResumeUploadDir,
  RESUME_READ_URL_PREFIX,
} from "@/src/lib/resume-storage";
import {
  buildStoredFileName,
  getMaxResumeBytes,
  RESUME_FILE_TOO_LARGE_MESSAGE,
  validateResumeFile,
} from "@/src/lib/resume-upload-validation";

export const runtime = "nodejs";

/**
 * POST /api/resumes/upload
 *
 * Multipart form-data with field name `file` (single file).
 *
 * **Why not multer:** Multer is built for Express (`req`/`res`). Next.js App Router uses the Web
 * `Request` API — `request.formData()` is the supported way to parse `multipart/form-data` and
 * is equivalent for this use case. (Streaming large bodies can use `busboy` if needed later.)
 *
 * **RBAC:** `canUploadResume` — ADMIN and RECRUITER only; HIRING_MANAGER → 403 (read-only for resumes).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiAuth(canUploadResume);
  if (auth instanceof NextResponse) return auth;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  const cfg = readRateLimitConfig({
    maxEnv: "RESUME_UPLOAD_RATE_MAX",
    windowMsEnv: "RESUME_UPLOAD_RATE_WINDOW_MS",
    defaultMax: 5,
    defaultWindowMs: 60_000,
  });
  const limited = await consumeApiRateLimit({
    prefix: "recruitment:resume:ratelimit:v1:",
    scope: "upload",
    identity: userId,
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

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

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

  try {
    await writeFile(absolutePath, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Write failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[resumes/upload] writeFile", e);
    }
    return apiError("WRITE_FAILED", "Could not save file to disk.", 500, { reason: msg });
  }

  const readUrl = `${RESUME_READ_URL_PREFIX}${encodeURIComponent(storedName)}`;

  return NextResponse.json(
    {
      storageKey: storedName,
      originalFileName,
      readUrl,
    },
    { status: 201 }
  );
}
