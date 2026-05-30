import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import { processPendingParseJobs } from "@/src/lib/process-pending-parse-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verifies scheduled or manual invocations. Set `CRON_SECRET` in env; send either:
 * - `Authorization: Bearer <CRON_SECRET>` (Vercel Cron uses this when the secret is configured), or
 * - `x-cron-secret: <CRON_SECRET>` (handy for curl).
 */
function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (bearer === secret) return true;
  const header = request.headers.get("x-cron-secret")?.trim();
  return header === secret;
}

/**
 * GET / POST /api/cron/process-parse-jobs
 *
 * Safety-net drain for pending `ResumeParseJob` rows when BullMQ/worker is down (default 10, max 50).
 * Normal path: `POST .../resume/parse` or upload → `resumeParsingQueue` → worker.
 * sets COMPLETED or FAILED, and writes ActivityLog completion/failure rows.
 *
 * **Auth:** `CRON_SECRET` must be set; request must include the secret (see `verifyCronSecret`).
 *
 * **Query:** `limit` — optional batch size (1–50).
 *
 * **Scheduling:** Add `vercel.json` `crons` entry (see repo) or call manually after deploy.
 */
async function handle(request: Request): Promise<NextResponse> {
  if (!process.env.CRON_SECRET?.trim()) {
    return apiError(
      "CRON_NOT_CONFIGURED",
      "Set CRON_SECRET in the environment to enable the parse worker endpoint.",
      503
    );
  }
  if (!verifyCronSecret(request)) {
    return apiError("UNAUTHORIZED", "Invalid or missing cron secret.", 401);
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw
    ? Math.min(50, Math.max(1, parseInt(limitRaw, 10) || 10))
    : undefined;

  try {
    const result = await processPendingParseJobs(prisma, { limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError("PROCESS_FAILED", msg, 500);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
