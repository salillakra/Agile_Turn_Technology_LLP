import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canReadResume } from "@/src/lib/rbac";
import { mimeFromResumeFileName } from "@/src/lib/resume-mime";
import { ensureResumeUploadDir, safeResumeFilePath } from "@/src/lib/resume-storage";

export const runtime = "nodejs";

/**
 * GET /api/resumes/local/[...path]
 * Streams a file from `uploads/resumes` for authenticated dashboard users.
 * Path segments must not contain `..` or slashes (single-level names only for now).
 *
 * **RBAC:** `canReadResume` — ADMIN, RECRUITER, and HIRING_MANAGER (read-only for HM).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const auth = await requireApiAuth(canReadResume);
  if (auth instanceof NextResponse) return auth;

  ensureResumeUploadDir();

  const { path: segments } = await context.params;
  const fullPath = safeResumeFilePath(segments ?? []);
  if (fullPath == null) {
    return apiError("INVALID_PATH", "Invalid or unsafe file path", 400);
  }

  try {
    const st = await stat(fullPath);
    if (!st.isFile()) {
      return apiError("NOT_FOUND", "Not a file", 404);
    }
    const buf = await readFile(fullPath);
    const name = segments[segments.length - 1] ?? "resume";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": mimeFromResumeFileName(name),
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return apiError("NOT_FOUND", "File not found", 404);
    }
    throw e;
  }
}
