import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canCreateJob } from "@/src/lib/rbac";
import { parseJobDescriptionFromBuffer } from "@/src/lib/job-parse/parse-job-description";
import { getMaxResumeBytes } from "@/src/lib/resume-upload-validation";

/** POST /api/jobs/parse — DOCX/PDF JD → structured create-shaped draft (multipart field `file`). */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canCreateJob);
  if (auth instanceof NextResponse) return auth;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing JD file (field: file)" }, { status: 400 });
  }

  const maxBytes = getMaxResumeBytes();
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File must be less than ${Math.round(maxBytes / (1024 * 1024))}MB`, code: "FILE_TOO_LARGE" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseJobDescriptionFromBuffer({
    originalName: file.name || "job.pdf",
    mimeType: file.type || "",
    buffer,
  });

  if (!result.ok) {
    const status =
      result.code === "INVALID_FILE_TYPE" ||
      result.code === "EMPTY_TEXT" ||
      result.code === "FILE_TOO_LARGE"
        ? 400
        : result.code === "LLM_FAILED" && result.error.includes("not configured")
          ? 503
          : 422;
    return NextResponse.json(
      { error: result.error, code: result.code ?? "PARSE_FAILED" },
      { status }
    );
  }

  return NextResponse.json({
    confidence: result.confidence,
    textChars: result.textChars,
    missingFields: result.missingFields,
    parsed: result.parsed,
    body: result.body,
  });
}
