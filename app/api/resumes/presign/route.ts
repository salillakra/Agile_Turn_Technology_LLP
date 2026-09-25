import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canUploadResume } from "@/src/lib/rbac";
import { consumeApiRateLimit, rateLimitedResponse, readRateLimitConfig } from "@/src/lib/api-rate-limit";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { getStorage, isDirectUploadEnabled } from "@/src/lib/storage";
import { buildResumeObjectKey } from "@/src/lib/storage/object-keys";
import { mimeFromResumeFileName } from "@/src/lib/resume-mime";
import { getMaxResumeBytes, validateResumeUploadMeta } from "@/src/lib/resume-upload-validation";

export const runtime = "nodejs";

const PRESIGN_EXPIRES_SECONDS = 300;

/**
 * POST /api/resumes/presign
 *
 * Returns a browser-direct PUT URL (S3-compatible) or `{ mode: "proxy" }` for local disk.
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
    scope: "presign",
    identity: userId,
    max: cfg.max,
    windowMs: cfg.windowMs,
  });
  if (limited.ok === false) {
    return rateLimitedResponse({
      message: "Too many resume uploads. Try later.",
      retryAfterSeconds: limited.retryAfterSeconds,
      limit: cfg.max,
      windowSeconds: Math.round(cfg.windowMs / 1000),
    });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body == null || typeof body !== "object") {
    return apiError("BAD_REQUEST", "Expected JSON body.", 400);
  }

  const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "upload";
  const mimeType = typeof body.contentType === "string" ? body.contentType : "";
  const size = typeof body.size === "number" ? body.size : Number(body.size);

  if (!candidateId || !isValidCuid(candidateId)) {
    return apiError("INVALID_ID", "candidateId is required.", 400);
  }

  const existing = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!existing) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const validated = validateResumeUploadMeta({
    originalName: fileName,
    mimeType,
    size: Number.isFinite(size) ? size : 0,
  });
  if (validated.ok === false) {
    return apiError(validated.code, validated.message, 400);
  }

  const objectKey = buildResumeObjectKey({ candidateId, ext: validated.ext });
  const contentType = mimeFromResumeFileName(objectKey);

  if (!isDirectUploadEnabled()) {
    return NextResponse.json({
      mode: "proxy",
      objectKey,
      maxBytes: getMaxResumeBytes(),
    });
  }

  const uploadUrl = await getStorage().getPresignedPutUrl(
    objectKey,
    contentType,
    PRESIGN_EXPIRES_SECONDS
  );
  if (!uploadUrl) {
    return NextResponse.json({
      mode: "proxy",
      objectKey,
      maxBytes: getMaxResumeBytes(),
    });
  }

  return NextResponse.json({
    mode: "direct",
    objectKey,
    uploadUrl,
    method: "PUT",
    headers: { "Content-Type": contentType },
    expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
    maxBytes: getMaxResumeBytes(),
  });
}
