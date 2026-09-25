import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canReadResume } from "@/src/lib/rbac";
import { mimeFromResumeFileName } from "@/src/lib/resume-mime";
import { getResumeFile } from "@/src/lib/resume-storage";
import { isSafeStorageKey, toResumeObjectKey } from "@/src/lib/storage/object-keys";

export const runtime = "nodejs";

/**
 * GET /api/resumes/local/[...path]
 * Streams a resume object from storage for authenticated dashboard users.
 *
 * **RBAC:** `canReadResume` — ADMIN, RECRUITER, and HIRING_MANAGER (read-only for HM).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const auth = await requireApiAuth(canReadResume);
  if (auth instanceof NextResponse) return auth;

  const { path: segments } = await context.params;
  if (!segments || segments.length === 0) {
    return apiError("INVALID_PATH", "Invalid or unsafe file path", 400);
  }

  let decoded: string;
  try {
    decoded = segments.map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return apiError("INVALID_PATH", "Invalid or unsafe file path", 400);
  }
  if (!isSafeStorageKey(decoded)) {
    return apiError("INVALID_PATH", "Invalid or unsafe file path", 400);
  }

  const key = toResumeObjectKey(decoded);
  if (!key) {
    return apiError("INVALID_PATH", "Invalid or unsafe file path", 400);
  }

  const buf = await getResumeFile(key);
  if (!buf) {
    return apiError("NOT_FOUND", "File not found", 404);
  }
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mimeFromResumeFileName(key),
      "Content-Disposition": `inline; filename="${encodeURIComponent(key.split("/").pop() ?? "resume")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
