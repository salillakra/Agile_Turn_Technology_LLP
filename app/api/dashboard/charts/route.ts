import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import {
  getApplicationsCreatedAtFilter,
  parseDashboardRangeParams,
  dashboardRangeCacheToken,
  getDateFilterOptions,
  toUtcMonthKey,
} from "@/src/lib/dashboard-range";
import {
  dashboardDatabaseError,
  requireDashboardAuth,
} from "@/src/lib/dashboard-api";
import {
  dashboardChartsCacheLogicalKey,
  getDashboardAnalyticsCache,
  setDashboardAnalyticsCache,
} from "@/src/lib/dashboard-analytics-cache";
import { calculateFraction } from "@/src/lib/metrics";
import type { ApplicationStage } from "@prisma/client";
import {
  DASHBOARD_API_ENDPOINT,
  withDashboardTelemetry,
} from "@/src/lib/dashboard-telemetry";
import {
  consumeDashboardRateLimit,
  dashboardRateLimitedResponse,
} from "@/src/lib/dashboard-rate-limit";
import { scheduleAnalyticsCacheRefresh } from "@/src/lib/enqueue-analytics-refresh";
import {
  DRILLDOWN_APPLICATIONS_API,
  DRILLDOWN_APPLICANTS_PAGE,
  applicationsStageQuery,
  applicationsSourceQuery,
} from "@/src/lib/dashboard-drilldown";

/** Dashboard cache uses Redis (`REDIS_HOST` / `REDIS_URL`) or in-memory fallback; requires Node for TCP. */
export const runtime = "nodejs";

const ENDPOINT = DASHBOARD_API_ENDPOINT.charts;

/** GET /api/dashboard/charts
 * Rate limit: 60 requests / minute / user (shared across dashboard APIs); 429 + `Retry-After` when exceeded.
 * Responsibility: return datasets used by dashboard graphs/charts.
 * `sourceDistribution[]`: `count` = applications in scope per `Candidate.candidateSource`; `hireCount` = applications in HIRED;
 * `sourceToHireRate` = hireCount/count; `sourceToOfferRate` = (OFFER_SENT + HIRED) / count (fractions 0–1, 2 d.p.).
 * Drill-down: each `stageDistribution` / `sourceDistribution` item includes `applicationsQuery`, `applicantsDrillDownHref`, `applicationsApiUrl` where applicable (UNKNOWN source has no API filter).
 * Timezone: monthly buckets use UTC only (`toUtcMonthKey`); policy constant `DASHBOARD_METRICS_STORAGE_AND_AGGREGATION_TZ` in `@/src/lib/dashboard-range`.
 * Cache: Redis + in-memory (TTL 5–15 min, env `DASHBOARD_ANALYTICS_CACHE_TTL_SEC`). Includes pipeline stage distribution.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = await requireDashboardAuth();
  if (auth instanceof NextResponse) {
    return withDashboardTelemetry(auth, {
      endpoint: ENDPOINT,
      role: "UNKNOWN",
      startedAt,
      cacheHit: "n/a",
      queryTimeMs: 0,
      errorCode: auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }
  const { session } = auth;
  const role = session.user?.role ?? "UNKNOWN";
  const userId = session.user?.id;

  const rateLimit = await consumeDashboardRateLimit(userId);
  if (rateLimit.ok === false) {
    return withDashboardTelemetry(
      dashboardRateLimitedResponse(rateLimit.retryAfterSeconds),
      {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: "n/a",
        queryTimeMs: 0,
        errorCode: "RATE_LIMITED",
      }
    );
  }

  const parsedRange = parseDashboardRangeParams(new URL(request.url).searchParams);
  if (parsedRange == null) {
    return withDashboardTelemetry(
      apiError(
        "INVALID_RANGE",
        "range must be one of: 7d, 30d, 90d, all, or custom with dateFrom",
        400
      ),
      {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: "n/a",
        queryTimeMs: 0,
        errorCode: "INVALID_RANGE",
      }
    );
  }

  const rangeKey = dashboardRangeCacheToken(parsedRange);
  const cacheKey = dashboardChartsCacheLogicalKey({ role, userId, range: rangeKey });
  const { value: cached } = await getDashboardAnalyticsCache<Record<string, unknown>>(cacheKey);
  if (cached != null) {
    // SWR: serve cached immediately, refresh async.
    scheduleAnalyticsCacheRefresh({
      scope: "dashboard",
      cacheKey,
      userId: userId ?? undefined,
      role,
    });
    return withDashboardTelemetry(NextResponse.json(cached), {
      endpoint: ENDPOINT,
      role,
      startedAt,
      cacheHit: "hit",
      queryTimeMs: 0,
    });
  }

  scheduleAnalyticsCacheRefresh({
    scope: "dashboard",
    cacheKey,
    userId: userId ?? undefined,
    role,
  });

  const createdAt = getApplicationsCreatedAtFilter(
    parsedRange.range,
    getDateFilterOptions(parsedRange)
  );

  const dbStartedAt = Date.now();
  try {
    // Non-admin roles are scoped to assigned jobs.
    const isAdmin = role === "ADMIN";
    const scopedUserId = typeof userId === "string" ? userId.trim() : "";
    const scopedJobs = isAdmin
      ? null
      : await prisma.jobAssignment.findMany({
          where: { userId: scopedUserId },
          select: { jobId: true },
          distinct: ["jobId"],
        });
    const scopedJobIds = isAdmin ? null : scopedJobs?.map((row) => row.jobId) ?? [];

    if (!isAdmin && scopedJobIds.length === 0) {
      const emptyPayload = {
        drillDown: {
          applicationsApiPath: DRILLDOWN_APPLICATIONS_API,
          applicantsPagePath: DRILLDOWN_APPLICANTS_PAGE,
        },
        stageDistribution: [],
        sourceDistribution: [],
        departmentDistribution: [],
        monthlyTrend: [],
      };
      await setDashboardAnalyticsCache(cacheKey, emptyPayload);
      const queryTimeMsEmpty = Date.now() - dbStartedAt;
      return withDashboardTelemetry(NextResponse.json(emptyPayload), {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: "miss",
        queryTimeMs: queryTimeMsEmpty,
      });
    }

    const applicationsWhere = {
      withdrawnAt: null as null,
      ...(createdAt ? { appliedDate: createdAt } : {}),
      ...(!isAdmin ? { jobId: { in: scopedJobIds as string[] } } : {}),
    };

    const [stageGroups, appsByJob, appsByMonth, sourceRows] = await Promise.all([
      prisma.application.groupBy({
        by: ["stage"],
        where: applicationsWhere,
        _count: { id: true },
      }),
      prisma.application.groupBy({
        by: ["jobId"],
        where: applicationsWhere,
        _count: { id: true },
      }),
      prisma.application.groupBy({
        by: ["createdAt"],
        where: applicationsWhere,
        _count: { id: true },
      }),
      prisma.application.findMany({
        where: applicationsWhere,
        select: {
          stage: true,
          candidate: { select: { candidateSource: true } },
        },
      }),
    ]);

    const jobs = await prisma.job.findMany({
      where: { id: { in: appsByJob.map((row) => row.jobId) } },
      select: { id: true, department: true },
    });

    const jobDepartmentById = new Map(jobs.map((job) => [job.id, job.department] as const));
    const departmentCount = new Map<string, number>();
    for (const row of appsByJob) {
      const department = jobDepartmentById.get(row.jobId) ?? "UNKNOWN";
      departmentCount.set(department, (departmentCount.get(department) ?? 0) + row._count.id);
    }

    const monthCount = new Map<string, number>();
    for (const row of appsByMonth) {
      const monthKey = toUtcMonthKey(row.createdAt);
      monthCount.set(monthKey, (monthCount.get(monthKey) ?? 0) + row._count.id);
    }

    const stageDistribution = stageGroups
      .map((row) => {
        const stage = row.stage as ApplicationStage;
        const q = applicationsStageQuery(stage);
        return {
          stage,
          count: row._count.id,
          applicationsQuery: q,
          applicantsDrillDownHref: `${DRILLDOWN_APPLICANTS_PAGE}?${q}`,
          applicationsApiUrl: `${DRILLDOWN_APPLICATIONS_API}?${q}`,
        };
      })
      .sort((a, b) => a.stage.localeCompare(b.stage));

    type SourceAgg = { count: number; hires: number; offerReach: number };
    const sourceAgg = new Map<string, SourceAgg>();
    for (const row of sourceRows) {
      const source = row.candidate.candidateSource ?? "UNKNOWN";
      const cur = sourceAgg.get(source) ?? { count: 0, hires: 0, offerReach: 0 };
      cur.count += 1;
      if (row.stage === "HIRED") cur.hires += 1;
      if (row.stage === "OFFER_SENT" || row.stage === "HIRED") cur.offerReach += 1;
      sourceAgg.set(source, cur);
    }

    const sourceDistribution = Array.from(sourceAgg.entries())
      .map(([source, s]) => {
        const q = applicationsSourceQuery(source);
        return {
          source,
          count: s.count,
          hireCount: s.hires,
          sourceToHireRate: calculateFraction(s.hires, s.count),
          sourceToOfferRate: calculateFraction(s.offerReach, s.count),
          applicationsQuery: q,
          applicantsDrillDownHref: q ? `${DRILLDOWN_APPLICANTS_PAGE}?${q}` : null,
          applicationsApiUrl: q ? `${DRILLDOWN_APPLICATIONS_API}?${q}` : null,
        };
      })
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

    const departmentDistribution = Array.from(departmentCount.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department));

    const monthlyTrend = Array.from(monthCount.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const payload = {
      drillDown: {
        applicationsApiPath: DRILLDOWN_APPLICATIONS_API,
        applicantsPagePath: DRILLDOWN_APPLICANTS_PAGE,
      },
      stageDistribution,
      sourceDistribution,
      departmentDistribution,
      monthlyTrend,
    };
    await setDashboardAnalyticsCache(cacheKey, payload);
    const queryTimeMs = Date.now() - dbStartedAt;
    return withDashboardTelemetry(NextResponse.json(payload), {
      endpoint: ENDPOINT,
      role,
      startedAt,
      cacheHit: "miss",
      queryTimeMs,
    });
  } catch (error) {
    const queryTimeMs = Date.now() - dbStartedAt;
    return withDashboardTelemetry(dashboardDatabaseError(error), {
      endpoint: ENDPOINT,
      role,
      startedAt,
      cacheHit: "miss",
      queryTimeMs,
      errorCode: "DATABASE_ERROR",
    });
  }
}

