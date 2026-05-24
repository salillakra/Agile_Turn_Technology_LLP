import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireDashboardAuth } from "@/src/lib/dashboard-api";
import { computeDashboardSummaryApplicationKpis } from "@/src/lib/dashboard-summary-kpis";
import type { Role } from "@prisma/client";
import {
  getApplicationsCreatedAtFilter,
  getPreviousApplicationsCreatedAtFilter,
  parseDashboardRange,
} from "@/src/lib/dashboard-range";
import { getReportsJobScope } from "@/src/lib/reports-job-filter";
import {
  buildReportsCacheKey,
  getReportsCache,
  setReportsCache,
} from "@/src/lib/reports-cache";
import { calculatePercentChange } from "@/src/lib/metrics";
import { withReportsTelemetry } from "@/src/lib/reports-telemetry";

export const runtime = "nodejs";

function parseCompareFlag(value: string | null): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** GET /api/reports/overview
 * Purpose: summary report.
 * Supports query params: `range`, `jobId`, `department`.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = await requireDashboardAuth();
  if (auth instanceof NextResponse) return auth;

  const { session } = auth;
  const role = (session.user?.role ?? "UNKNOWN") as Role | string;
  const userId = session.user?.id;

  const { searchParams } = new URL(request.url);
  const rangeRaw = searchParams.get("range");
  const range = parseDashboardRange(rangeRaw);
  if (range == null) {
    return apiError(
      "INVALID_RANGE",
      "range must be one of: 7d, 30d, 90d, all",
      400
    );
  }

  const jobId = searchParams.get("jobId");
  const department = searchParams.get("department");
  const compare = parseCompareFlag(searchParams.get("compare"));
  if (compare && range === "all") {
    return apiError(
      "INVALID_COMPARE",
      "compare=true requires a bounded range (7d, 30d, or 90d), not all",
      400
    );
  }
  const cacheKey = buildReportsCacheKey({
    endpoint: "overview",
    role: String(role),
    userId,
    range,
    jobId,
    department,
    type: compare ? "compare" : "plain",
  });
  const cached = await getReportsCache<Record<string, unknown>>(cacheKey);
  if (cached != null) {
    return withReportsTelemetry(NextResponse.json(cached), {
      endpoint: "/api/reports/overview",
      role: String(role),
      startedAt,
      cacheHit: "hit",
      queryTimeMs: 0,
    });
  }
  const dbStartedAt = Date.now();

  let jobScopeInfo;
  try {
    jobScopeInfo = await getReportsJobScope({
      role,
      userId,
      jobId,
      department,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_JOB_ID") {
      return apiError("INVALID_JOB_ID", "Malformed jobId format", 400);
    }
    throw e;
  }

  if (jobScopeInfo.jobIds != null && jobScopeInfo.jobIds.length === 0) {
    const empty = {
      totalJobs: 0,
      totalCandidates: 0,
      totalApplications: 0,
      hiredCount: 0,
      rejectedCount: 0,
      offerRate: 0,
      conversionRate: 0,
    };
    await setReportsCache(cacheKey, empty);
    return withReportsTelemetry(NextResponse.json(empty), {
      endpoint: "/api/reports/overview",
      role: String(role),
      startedAt,
      cacheHit: "miss",
      queryTimeMs: Date.now() - dbStartedAt,
    });
  }

  const jobScope =
    jobScopeInfo.jobIds == null
      ? {}
      : { jobId: { in: jobScopeInfo.jobIds as string[] } };

  const createdAtFilter = getApplicationsCreatedAtFilter(range);
  const previousFilter = compare ? getPreviousApplicationsCreatedAtFilter(range) : null;
  const [kpis, prevKpis] =
    compare && previousFilter
      ? await Promise.all([
          computeDashboardSummaryApplicationKpis(jobScope, createdAtFilter),
          computeDashboardSummaryApplicationKpis(jobScope, previousFilter),
        ])
      : await Promise.all([
          computeDashboardSummaryApplicationKpis(jobScope, createdAtFilter),
          Promise.resolve(null),
        ]);

  const flat = {
    totalJobs: jobScopeInfo.totalJobs,
    totalCandidates: kpis.totalCandidates,
    totalApplications: kpis.totalApplications,
    hiredCount: kpis.hiredCount,
    rejectedCount: kpis.rejectedCount,
    offerRate: kpis.offerRate,
    conversionRate: kpis.conversionRate,
  };
  const payload =
    compare && prevKpis
      ? {
          currentPeriod: flat,
          previousPeriod: {
            totalJobs: jobScopeInfo.totalJobs,
            totalCandidates: prevKpis.totalCandidates,
            totalApplications: prevKpis.totalApplications,
            hiredCount: prevKpis.hiredCount,
            rejectedCount: prevKpis.rejectedCount,
            offerRate: prevKpis.offerRate,
            conversionRate: prevKpis.conversionRate,
          },
          percentageChange: {
            totalJobs: 0,
            totalCandidates: calculatePercentChange(
              kpis.totalCandidates,
              prevKpis.totalCandidates
            ),
            totalApplications: calculatePercentChange(
              kpis.totalApplications,
              prevKpis.totalApplications
            ),
            hiredCount: calculatePercentChange(kpis.hiredCount, prevKpis.hiredCount),
            rejectedCount: calculatePercentChange(
              kpis.rejectedCount,
              prevKpis.rejectedCount
            ),
            offerRate: calculatePercentChange(kpis.offerRate, prevKpis.offerRate),
            conversionRate: calculatePercentChange(
              kpis.conversionRate,
              prevKpis.conversionRate
            ),
          },
        }
      : flat;
  await setReportsCache(cacheKey, payload);
  return withReportsTelemetry(NextResponse.json(payload), {
    endpoint: "/api/reports/overview",
    role: String(role),
    startedAt,
    cacheHit: "miss",
    queryTimeMs: Date.now() - dbStartedAt,
  });
}

