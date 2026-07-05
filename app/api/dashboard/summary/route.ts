import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import {
  getApplicationsCreatedAtFilter,
  getPreviousApplicationsCreatedAtFilter,
  parseDashboardRangeParams,
  dashboardRangeCacheToken,
  getDateFilterOptions,
  isBoundedDashboardRange,
} from "@/src/lib/dashboard-range";
import {
  dashboardDatabaseError,
  requireDashboardAuth,
} from "@/src/lib/dashboard-api";
import { calculatePercentChange } from "@/src/lib/metrics";
import { computeDashboardSummaryApplicationKpis } from "@/src/lib/dashboard-summary-kpis";
import { computeDashboardTimeInStageAverages } from "@/src/lib/dashboard-time-in-stage";
import {
  dashboardSummaryCacheLogicalKey,
  getDashboardAnalyticsCache,
  setDashboardAnalyticsCache,
} from "@/src/lib/dashboard-analytics-cache";
import {
  DASHBOARD_API_ENDPOINT,
  withDashboardTelemetry,
} from "@/src/lib/dashboard-telemetry";
import {
  consumeDashboardRateLimit,
  dashboardRateLimitedResponse,
} from "@/src/lib/dashboard-rate-limit";
import { scheduleAnalyticsCacheRefresh } from "@/src/lib/enqueue-analytics-refresh";

/** Dashboard cache uses Redis (`REDIS_URL`) or in-memory fallback; requires Node for TCP. */
export const runtime = "nodejs";

const ENDPOINT = DASHBOARD_API_ENDPOINT.summary;

function parseCompareFlag(value: string | null): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** GET /api/dashboard/summary
 * Rate limit: 60 requests / minute / user (shared across dashboard APIs); 429 + `Retry-After` when exceeded.
 * Responsibility: return KPI metrics for top dashboard cards.
 * Query: `range` (7d|30d|90d|all), optional `compare=true` (requires bounded range).
 * Includes `*AvgDays` time-in-stage metrics from `ActivityLog` `STAGE_CHANGE` (completed segments only).
 * Timezone: see `DASHBOARD_METRICS_STORAGE_AND_AGGREGATION_TZ` in `@/src/lib/dashboard-range` — no business-TZ conversion here;
 * `averageTimeToHire` is a duration from DB instants (timezone-invariant).
 * Cache: Redis + in-memory via `dashboard-analytics-cache` (TTL 5–15 min, env `DASHBOARD_ANALYTICS_CACHE_TTL_SEC`).
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

  const { searchParams } = new URL(request.url);
  const parsedRange = parseDashboardRangeParams(searchParams);
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

  const compare = parseCompareFlag(searchParams.get("compare"));
  if (compare && !isBoundedDashboardRange(parsedRange)) {
    return withDashboardTelemetry(
      apiError(
        "INVALID_COMPARE",
        "compare=true requires a bounded range, not all",
        400
      ),
      {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: "n/a",
        queryTimeMs: 0,
        errorCode: "INVALID_COMPARE",
      }
    );
  }

  const rangeKey = dashboardRangeCacheToken(parsedRange);
  const cacheKey = dashboardSummaryCacheLogicalKey({
    role,
    userId,
    range: rangeKey,
    compare,
  });
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

  const dateFilterOptions = getDateFilterOptions(parsedRange);
  const createdAt = getApplicationsCreatedAtFilter(parsedRange.range, dateFilterOptions);
  const previousBounds = compare
    ? getPreviousApplicationsCreatedAtFilter(parsedRange.range, dateFilterOptions)
    : null;

  const dbStartedAt = Date.now();
  try {
    // Non-admin roles are scoped to assigned jobs.
    const isAdmin = role === "ADMIN";
    const scopedUserId = typeof userId === "string" ? userId.trim() : "";
    const scopedJobs = isAdmin
      ? null
      : await prisma.jobAssignment.findMany({
          where: { userId: scopedUserId },
          select: { jobId: true, job: { select: { status: true } } },
          distinct: ["jobId"],
        });

    const scopedJobIds = isAdmin ? null : scopedJobs?.map((row) => row.jobId) ?? [];
    const jobScope =
      !isAdmin && scopedJobIds.length > 0
        ? { jobId: { in: scopedJobIds as string[] } as const }
        : {};

    if (!isAdmin && scopedJobIds.length === 0) {
      const empty = {
        totalJobs: 0,
        openJobs: 0,
        totalCandidates: 0,
        totalApplications: 0,
        activePipelineCount: 0,
        hiredCount: 0,
        rejectedCount: 0,
        offerSentCount: 0,
        offerRate: 0,
        conversionRate: 0,
        averageTimeToHire: 0,
        appliedToScreeningRate: 0,
        screeningToInterviewRate: 0,
        interviewToHireRate: 0,
        appliedAvgDays: 0,
        screeningAvgDays: 0,
        interviewAvgDays: 0,
        technicalAvgDays: 0,
        finalRoundAvgDays: 0,
        offerSentAvgDays: 0,
        ...(compare
          ? {
              previousTotalApplications: 0,
              totalApplicationsChangePercent: 0,
              previousTotalCandidates: 0,
              totalCandidatesChangePercent: 0,
              previousActivePipelineCount: 0,
              activePipelineCountChangePercent: 0,
              previousHiredCount: 0,
              hiredCountChangePercent: 0,
              previousRejectedCount: 0,
              rejectedCountChangePercent: 0,
              previousOfferSentCount: 0,
              offerSentCountChangePercent: 0,
              previousOfferRate: 0,
              offerRateChangePercent: null,
              previousConversionRate: 0,
              conversionRateChangePercent: null,
              previousAverageTimeToHire: 0,
              averageTimeToHireChangePercent: null,
            }
          : {}),
      };
      await setDashboardAnalyticsCache(cacheKey, empty);
      const queryTimeMs = Date.now() - dbStartedAt;
      return withDashboardTelemetry(NextResponse.json(empty), {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: "miss",
        queryTimeMs,
      });
    }

    const jobStatusPromise = isAdmin
      ? prisma.job.groupBy({
          by: ["status"],
          _count: { id: true },
        })
      : Promise.resolve([
          {
            status: "OPEN" as const,
            _count: { id: scopedJobs?.filter((row) => row.job.status === "OPEN").length ?? 0 },
          },
          {
            status: "PAUSED" as const,
            _count: { id: scopedJobs?.filter((row) => row.job.status === "PAUSED").length ?? 0 },
          },
          {
            status: "CLOSED" as const,
            _count: { id: scopedJobs?.filter((row) => row.job.status === "CLOSED").length ?? 0 },
          },
        ]);

    const [jobStatusCounts, currentApps, timeInStage, prevAppsFromBatch] =
      compare && previousBounds
        ? await Promise.all([
            jobStatusPromise,
          computeDashboardSummaryApplicationKpis(jobScope, createdAt),
          computeDashboardTimeInStageAverages(jobScope, createdAt),
            computeDashboardSummaryApplicationKpis(jobScope, previousBounds),
          ])
        : await Promise.all([
            jobStatusPromise,
          computeDashboardSummaryApplicationKpis(jobScope, createdAt),
          computeDashboardTimeInStageAverages(jobScope, createdAt),
            Promise.resolve(null),
          ]);

    const prevApps =
      compare && previousBounds ? prevAppsFromBatch : null;

    const totalJobs = jobStatusCounts.reduce((sum, row) => sum + row._count.id, 0);
    const openJobs =
      jobStatusCounts.find((row) => row.status === "OPEN")?._count.id ?? 0;

    const payload: Record<string, unknown> = {
      totalJobs,
      openJobs,
      totalCandidates: currentApps.totalCandidates,
      totalApplications: currentApps.totalApplications,
      activePipelineCount: currentApps.activePipelineCount,
      hiredCount: currentApps.hiredCount,
      rejectedCount: currentApps.rejectedCount,
      offerSentCount: currentApps.offerSentCount,
      offerRate: currentApps.offerRate,
      conversionRate: currentApps.conversionRate,
      averageTimeToHire: currentApps.averageTimeToHire,
      appliedToScreeningRate: currentApps.appliedToScreeningRate,
      screeningToInterviewRate: currentApps.screeningToInterviewRate,
      interviewToHireRate: currentApps.interviewToHireRate,
      appliedAvgDays: timeInStage.appliedAvgDays,
      screeningAvgDays: timeInStage.screeningAvgDays,
      interviewAvgDays: timeInStage.interviewAvgDays,
      technicalAvgDays: timeInStage.technicalAvgDays,
      finalRoundAvgDays: timeInStage.finalRoundAvgDays,
      offerSentAvgDays: timeInStage.offerSentAvgDays,
    };

    if (compare && previousBounds && prevApps) {
      payload.previousTotalApplications = prevApps.totalApplications;
      payload.totalApplicationsChangePercent = calculatePercentChange(
        currentApps.totalApplications,
        prevApps.totalApplications
      );

      payload.previousTotalCandidates = prevApps.totalCandidates;
      payload.totalCandidatesChangePercent = calculatePercentChange(
        currentApps.totalCandidates,
        prevApps.totalCandidates
      );

      payload.previousActivePipelineCount = prevApps.activePipelineCount;
      payload.activePipelineCountChangePercent = calculatePercentChange(
        currentApps.activePipelineCount,
        prevApps.activePipelineCount
      );

      payload.previousHiredCount = prevApps.hiredCount;
      payload.hiredCountChangePercent = calculatePercentChange(
        currentApps.hiredCount,
        prevApps.hiredCount
      );

      payload.previousRejectedCount = prevApps.rejectedCount;
      payload.rejectedCountChangePercent = calculatePercentChange(
        currentApps.rejectedCount,
        prevApps.rejectedCount
      );

      payload.previousOfferSentCount = prevApps.offerSentCount;
      payload.offerSentCountChangePercent = calculatePercentChange(
        currentApps.offerSentCount,
        prevApps.offerSentCount
      );

      payload.previousOfferRate = prevApps.offerRate;
      payload.offerRateChangePercent = calculatePercentChange(
        currentApps.offerRate,
        prevApps.offerRate
      );

      payload.previousConversionRate = prevApps.conversionRate;
      payload.conversionRateChangePercent = calculatePercentChange(
        currentApps.conversionRate,
        prevApps.conversionRate
      );

      payload.previousAverageTimeToHire = prevApps.averageTimeToHire;
      payload.averageTimeToHireChangePercent = calculatePercentChange(
        currentApps.averageTimeToHire,
        prevApps.averageTimeToHire
      );
    }

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
