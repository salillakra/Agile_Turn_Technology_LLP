import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireDashboardAuth } from "@/src/lib/dashboard-api";
import { prisma } from "@/src/lib/prisma";
import { calculateAverageTimeToHire } from "@/src/lib/metrics";
import type { Role } from "@prisma/client";
import {
  getApplicationsCreatedAtFilter,
  parseDashboardRange,
} from "@/src/lib/dashboard-range";
import { getReportsJobScope } from "@/src/lib/reports-job-filter";
import {
  buildReportsCacheKey,
  getReportsCache,
  setReportsCache,
} from "@/src/lib/reports-cache";
import { withReportsTelemetry } from "@/src/lib/reports-telemetry";
import { scheduleAnalyticsCacheRefresh } from "@/src/lib/enqueue-analytics-refresh";

export const runtime = "nodejs";

/** GET /api/reports/time-to-hire
 * Purpose: hiring speed / time-to-hire report.
 *
 * Uses application.createdAt -> application.hiredAt.
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
  const cacheKey = buildReportsCacheKey({
    endpoint: "time-to-hire",
    role: String(role),
    userId,
    range,
    jobId,
    department,
  });
  const cached = await getReportsCache<Record<string, unknown>>(cacheKey);
  if (cached != null) {
    scheduleAnalyticsCacheRefresh({
      scope: "reports",
      cacheKey,
      userId: userId ?? undefined,
      role: String(role),
    });
    return withReportsTelemetry(NextResponse.json(cached), {
      endpoint: "/api/reports/time-to-hire",
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
      averageTimeToHire: 0,
      medianTimeToHire: 0,
      minTimeToHire: 0,
      maxTimeToHire: 0,
    };
    await setReportsCache(cacheKey, empty);
    return NextResponse.json(empty);
  }

  const jobScope =
    jobScopeInfo.jobIds == null
      ? {}
      : { jobId: { in: jobScopeInfo.jobIds as string[] } };

  const createdAtFilter = getApplicationsCreatedAtFilter(range);

  const MS_PER_DAY = 86_400_000;

  const apps = await prisma.application.findMany({
    where: {
      withdrawnAt: null,
      hiredAt: { not: null },
      ...(createdAtFilter ? { appliedDate: createdAtFilter } : {}),
      ...jobScope,
    },
    select: { appliedDate: true, hiredAt: true },
  });

  const durationsDays: number[] = [];
  for (const a of apps) {
    if (!a.hiredAt) continue;
    const days = (a.hiredAt.getTime() - a.appliedDate.getTime()) / MS_PER_DAY;
    if (days >= 0 && Number.isFinite(days)) durationsDays.push(days);
  }

  const roundToTwo = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

  if (durationsDays.length === 0) {
    const empty = {
      averageTimeToHire: 0,
      medianTimeToHire: 0,
      minTimeToHire: 0,
      maxTimeToHire: 0,
    };
    await setReportsCache(cacheKey, empty);
    return NextResponse.json(empty);
  }

  const sorted = [...durationsDays].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const min = Math.min(...sorted);
  const max = Math.max(...sorted);
  const average = calculateAverageTimeToHire(sorted);

  const payload = {
    averageTimeToHire: average,
    medianTimeToHire: roundToTwo(median),
    minTimeToHire: roundToTwo(min),
    maxTimeToHire: roundToTwo(max),
  };
  await setReportsCache(cacheKey, payload);
  return withReportsTelemetry(NextResponse.json(payload), {
    endpoint: "/api/reports/time-to-hire",
    role: String(role),
    startedAt,
    cacheHit: "miss",
    queryTimeMs: Date.now() - dbStartedAt,
  });
}

