import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import {
  consumeApiRateLimit,
  rateLimitedResponse,
  readRateLimitConfig,
} from "@/src/lib/api-rate-limit";
import {
  BULK_RESUME_MAX_FILES,
  importResumesForJob,
} from "@/src/lib/bulk-resume-import";
import { prisma } from "@/src/lib/prisma";
import { canCreateCandidate, canUploadResume } from "@/src/lib/rbac";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function canBulkImportResumes(role: string | undefined): boolean {
  return canCreateCandidate(role) && canUploadResume(role);
}

/**
 * POST /api/jobs/[id]/resumes/bulk
 *
 * Multipart field `files` (repeated) — up to ~100 PDF/DOC/DOCX resumes.
 * Creates/reuses candidates in the job owner's silo, stores files, enqueues
 * BullMQ resume parse, then batch-creates APPLIED applications on the job.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiAuth(canBulkImportResumes);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const actorUserId =
    typeof session.user?.id === "string" ? session.user.id.trim() : "";
  if (!actorUserId) {
    return apiError("UNAUTHORIZED", "Invalid session", 401);
  }

  const { id: jobId } = await context.params;
  if (!jobId?.trim() || !isValidCuid(jobId)) {
    return apiError("INVALID_ID", "Malformed job id", 400);
  }

  if (!(await canAccessJobByScope(role, actorUserId, jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, ownerId: true, status: true, title: true },
  });
  if (!job) {
    return apiError("NOT_FOUND", "Job not found", 404);
  }
  if (job.status !== "OPEN") {
    return apiError("FORBIDDEN", "Bulk resume import is only allowed for open jobs", 403);
  }

  const rl = readRateLimitConfig({
    maxEnv: "BULK_RESUME_RATE_LIMIT_MAX",
    windowMsEnv: "BULK_RESUME_RATE_LIMIT_WINDOW_MS",
    defaultMax: 5,
    defaultWindowMs: 60 * 60 * 1000,
  });
  const limited = await consumeApiRateLimit({
    prefix: "recruitment:api:ratelimit:v1:",
    scope: "jobs-resumes-bulk",
    identity: actorUserId,
    max: rl.max,
    windowMs: rl.windowMs,
  });
  if (limited.ok === false) {
    return rateLimitedResponse({
      message: "Too many bulk resume uploads. Try again later.",
      retryAfterSeconds: limited.retryAfterSeconds,
      limit: rl.max,
      windowSeconds: Math.ceil(rl.windowMs / 1000),
    });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return apiError("VALIDATION_ERROR", "Expected multipart form data", 400);
  }

  const collected: File[] = [];
  for (const value of form.getAll("files")) {
    if (value instanceof File && value.size > 0) {
      collected.push(value);
    }
  }
  // Also accept single-field `file` for convenience.
  const single = form.get("file");
  if (single instanceof File && single.size > 0) {
    collected.push(single);
  }

  if (collected.length === 0) {
    return apiError(
      "VALIDATION_ERROR",
      "No resume files provided (field: files)",
      400
    );
  }
  if (collected.length > BULK_RESUME_MAX_FILES) {
    return apiError(
      "VALIDATION_ERROR",
      `At most ${BULK_RESUME_MAX_FILES} resumes per upload`,
      400
    );
  }

  try {
    const result = await importResumesForJob({
      session,
      jobId,
      jobOwnerId: job.ownerId,
      actorUserId,
      files: collected,
    });
    return NextResponse.json({
      jobId: job.id,
      jobTitle: job.title,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("TOTAL_SIZE_EXCEEDED:")) {
      return apiError("FILE_TOO_LARGE", msg.replace(/^TOTAL_SIZE_EXCEEDED:\s*/, ""), 400);
    }
    throw e;
  }
}
