import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { getParseBatchProgress } from "@/src/lib/parse-progress";
import { canReadResume } from "@/src/lib/rbac";
import { isValidCuid } from "@/src/lib/validate-id";

export const runtime = "nodejs";

const MAX_IDS = 200;

/**
 * POST /api/parse-progress/batch
 * Body: `{ candidateIds: string[] }` — latest parse status counts for bulk UI.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiAuth(canReadResume);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => null)) as {
    candidateIds?: unknown;
  } | null;
  if (!body || !Array.isArray(body.candidateIds)) {
    return apiError("VALIDATION_ERROR", "candidateIds array required", 400);
  }

  const ids = body.candidateIds
    .filter((id): id is string => typeof id === "string" && isValidCuid(id.trim()))
    .map((id) => id.trim())
    .slice(0, MAX_IDS);

  const progress = await getParseBatchProgress(ids);
  return NextResponse.json(progress);
}
