import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { isAdmin } from "@/src/lib/rbac";
import { consumeDashboardRateLimit } from "@/src/lib/dashboard-rate-limit";
import {
  getEmailMonitoringDashboard,
  parseEmailMonitoringFilter,
} from "@/src/lib/email/email-monitoring-service";

/**
 * GET /api/admin/email-monitoring
 *
 * Operational email dashboard (ADMIN). No UI in this repo yet — JSON for a future monitor page.
 *
 * Query:
 * - `range` — `7d` | `30d` | `90d` | `all` (default `30d`)
 * - `dateFrom` / `dateTo` — ISO UTC bounds (override range lower bound when both set)
 * - `status` — `PENDING` | `SENT` | `FAILED`
 * - `emailType` | `type` — `all`, `stage_updates`, `interview_reminders`, `marketing_emails`,
 *   `transactional`, or a template key (e.g. `offer_sent`)
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth((role) => isAdmin(role));
  if (auth instanceof NextResponse) return auth;

  const userId = auth.session.user?.id;
  const rateLimit = await consumeDashboardRateLimit(userId);
  if (rateLimit.ok === false) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSeconds: rateLimit.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  const filter = parseEmailMonitoringFilter(new URL(request.url).searchParams);
  if (!filter) {
    return apiError(
      "INVALID_FILTER",
      "Invalid range or date params. range must be 7d, 30d, 90d, or all",
      400
    );
  }

  try {
    const dashboard = await getEmailMonitoringDashboard(filter);
    return NextResponse.json(dashboard);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV === "development") {
      console.error("[email-monitoring]", error);
    }
    return apiError("DATABASE_ERROR", "Failed to load email monitoring data", 500, {
      reason,
    });
  }
}
