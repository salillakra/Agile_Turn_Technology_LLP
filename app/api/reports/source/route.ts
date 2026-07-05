import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireDashboardAuth } from "@/src/lib/dashboard-api";
import { prisma } from "@/src/lib/prisma";
import { calculateFraction } from "@/src/lib/metrics";
import type { ApplicationStage } from "@prisma/client";
import {
  getApplicationsCreatedAtFilter,
  getPreviousApplicationsCreatedAtFilter,
  parseDashboardRangeParams,
  dashboardRangeCacheToken,
  getDateFilterOptions,
  isBoundedDashboardRange,
} from "@/src/lib/dashboard-range";
import { getReportsJobScope } from "@/src/lib/reports-job-filter";
import {
  buildReportsCacheKey,
  getReportsCache,
  setReportsCache,
} from "@/src/lib/reports-cache";
import { calculatePercentChange } from "@/src/lib/metrics";
import { withReportsTelemetry } from "@/src/lib/reports-telemetry";
import { scheduleAnalyticsCacheRefresh } from "@/src/lib/enqueue-analytics-refresh";

export const runtime = "nodejs";

function parseCompareFlag(value: string | null): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** GET /api/reports/source
 * Purpose: candidate sources report.
 *
 * Returns counts per (bucketed) source plus:
 * - sourceToHireRate (HIRED / total applications for that bucket)
 * - sourceToOfferRate (OFFER_SENT+HIRED / total applications for that bucket)
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = await requireDashboardAuth();
  if (auth instanceof NextResponse) return auth;

  const { session } = auth;
  const role = session.user?.role ?? "UNKNOWN";
  const userId = session.user?.id;
  const { searchParams } = new URL(request.url);
  const parsedRange = parseDashboardRangeParams(searchParams);
  if (parsedRange == null) {
    return apiError(
      "INVALID_RANGE",
      "range must be one of: 7d, 30d, 90d, all, or custom with dateFrom",
      400
    );
  }

  const rangeKey = dashboardRangeCacheToken(parsedRange);
  const dateFilterOptions = getDateFilterOptions(parsedRange);

  const jobId = searchParams.get("jobId");
  const department = searchParams.get("department");
  const compare = parseCompareFlag(searchParams.get("compare"));
  if (compare && !isBoundedDashboardRange(parsedRange)) {
    return apiError(
      "INVALID_COMPARE",
      "compare=true requires a bounded range, not all",
      400
    );
  }
  const cacheKey = buildReportsCacheKey({
    endpoint: "source",
    role: String(role),
    userId,
    range: rangeKey,
    jobId,
    department,
    type: compare ? "compare" : "plain",
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
      endpoint: "/api/reports/source",
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
      countBySource: { LinkedIn: 0, Indeed: 0, Referral: 0, Website: 0, Other: 0 },
      sourceToHireRate: { LinkedIn: 0, Indeed: 0, Referral: 0, Website: 0, Other: 0 },
      sourceToOfferRate: { LinkedIn: 0, Indeed: 0, Referral: 0, Website: 0, Other: 0 },
    };
    const compareEmpty =
      compare
        ? {
            currentPeriod: empty,
            previousPeriod: empty,
            percentageChange: {
              countBySource: { LinkedIn: 0, Indeed: 0, Referral: 0, Website: 0, Other: 0 },
              sourceToHireRate: { LinkedIn: 0, Indeed: 0, Referral: 0, Website: 0, Other: 0 },
              sourceToOfferRate: { LinkedIn: 0, Indeed: 0, Referral: 0, Website: 0, Other: 0 },
            },
          }
        : empty;
    await setReportsCache(cacheKey, compareEmpty);
    return withReportsTelemetry(NextResponse.json(compareEmpty), {
      endpoint: "/api/reports/source",
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

  const createdAtFilter = getApplicationsCreatedAtFilter(parsedRange.range, dateFilterOptions);
  const previousFilter = compare
    ? getPreviousApplicationsCreatedAtFilter(parsedRange.range, dateFilterOptions)
    : null;
  const BUCKETS: Array<"LinkedIn" | "Indeed" | "Referral" | "Website" | "Other"> = [
    "LinkedIn",
    "Indeed",
    "Referral",
    "Website",
    "Other",
  ];
  const bucketForSource = (candidateSource: unknown): "LinkedIn" | "Indeed" | "Referral" | "Website" | "Other" => {
    // CandidateSource enum values (from Prisma): LINKEDIN | INDEED | REFERRAL | COMPANY_WEBSITE | GLASSDOOR | HEADHUNTER | OTHER.
    const s = typeof candidateSource === "string" ? candidateSource : null;
    if (s === "LINKEDIN") return "LinkedIn";
    if (s === "INDEED") return "Indeed";
    if (s === "REFERRAL") return "Referral";
    if (s === "COMPANY_WEBSITE" || s === "GLASSDOOR" || s === "HEADHUNTER") return "Website";
    return "Other";
  };

  async function computeForFilter(filter: { gte: Date } | { gte: Date; lt: Date } | undefined) {
    const where = {
      withdrawnAt: null as null,
      ...(filter ? { createdAt: filter } : {}),
      ...jobScope,
    };
    const sourceRows = await prisma.application.findMany({
      where,
      select: {
        stage: true,
        candidate: { select: { candidateSource: true } },
      },
    });

    type Agg = { count: number; hires: number; offerReach: number };
    const aggByBucket = new Map<string, Agg>();
    for (const b of BUCKETS) aggByBucket.set(b, { count: 0, hires: 0, offerReach: 0 });

    for (const row of sourceRows) {
      const bucket = bucketForSource(row.candidate?.candidateSource ?? null);
      const cur = aggByBucket.get(bucket) ?? { count: 0, hires: 0, offerReach: 0 };
      cur.count += 1;

      const st = row.stage as ApplicationStage;
      if (st === "HIRED") cur.hires += 1;
      if (st === "OFFER_SENT" || st === "HIRED") cur.offerReach += 1;
      aggByBucket.set(bucket, cur);
    }

    const countBySource = {
      LinkedIn: aggByBucket.get("LinkedIn")?.count ?? 0,
      Indeed: aggByBucket.get("Indeed")?.count ?? 0,
      Referral: aggByBucket.get("Referral")?.count ?? 0,
      Website: aggByBucket.get("Website")?.count ?? 0,
      Other: aggByBucket.get("Other")?.count ?? 0,
    };
    const sourceToHireRate = {
      LinkedIn: calculateFraction(aggByBucket.get("LinkedIn")?.hires ?? 0, countBySource.LinkedIn),
      Indeed: calculateFraction(aggByBucket.get("Indeed")?.hires ?? 0, countBySource.Indeed),
      Referral: calculateFraction(aggByBucket.get("Referral")?.hires ?? 0, countBySource.Referral),
      Website: calculateFraction(aggByBucket.get("Website")?.hires ?? 0, countBySource.Website),
      Other: calculateFraction(aggByBucket.get("Other")?.hires ?? 0, countBySource.Other),
    };
    const sourceToOfferRate = {
      LinkedIn: calculateFraction(
        aggByBucket.get("LinkedIn")?.offerReach ?? 0,
        countBySource.LinkedIn
      ),
      Indeed: calculateFraction(aggByBucket.get("Indeed")?.offerReach ?? 0, countBySource.Indeed),
      Referral: calculateFraction(
        aggByBucket.get("Referral")?.offerReach ?? 0,
        countBySource.Referral
      ),
      Website: calculateFraction(aggByBucket.get("Website")?.offerReach ?? 0, countBySource.Website),
      Other: calculateFraction(aggByBucket.get("Other")?.offerReach ?? 0, countBySource.Other),
    };
    return { countBySource, sourceToHireRate, sourceToOfferRate };
  }

  const currentPeriod = await computeForFilter(createdAtFilter);
  const previousPeriod =
    compare && previousFilter ? await computeForFilter(previousFilter) : null;

  const payload =
    compare && previousPeriod
      ? {
          currentPeriod,
          previousPeriod,
          percentageChange: {
            countBySource: {
              LinkedIn: calculatePercentChange(
                currentPeriod.countBySource.LinkedIn,
                previousPeriod.countBySource.LinkedIn
              ),
              Indeed: calculatePercentChange(
                currentPeriod.countBySource.Indeed,
                previousPeriod.countBySource.Indeed
              ),
              Referral: calculatePercentChange(
                currentPeriod.countBySource.Referral,
                previousPeriod.countBySource.Referral
              ),
              Website: calculatePercentChange(
                currentPeriod.countBySource.Website,
                previousPeriod.countBySource.Website
              ),
              Other: calculatePercentChange(
                currentPeriod.countBySource.Other,
                previousPeriod.countBySource.Other
              ),
            },
            sourceToHireRate: {
              LinkedIn: calculatePercentChange(
                currentPeriod.sourceToHireRate.LinkedIn,
                previousPeriod.sourceToHireRate.LinkedIn
              ),
              Indeed: calculatePercentChange(
                currentPeriod.sourceToHireRate.Indeed,
                previousPeriod.sourceToHireRate.Indeed
              ),
              Referral: calculatePercentChange(
                currentPeriod.sourceToHireRate.Referral,
                previousPeriod.sourceToHireRate.Referral
              ),
              Website: calculatePercentChange(
                currentPeriod.sourceToHireRate.Website,
                previousPeriod.sourceToHireRate.Website
              ),
              Other: calculatePercentChange(
                currentPeriod.sourceToHireRate.Other,
                previousPeriod.sourceToHireRate.Other
              ),
            },
            sourceToOfferRate: {
              LinkedIn: calculatePercentChange(
                currentPeriod.sourceToOfferRate.LinkedIn,
                previousPeriod.sourceToOfferRate.LinkedIn
              ),
              Indeed: calculatePercentChange(
                currentPeriod.sourceToOfferRate.Indeed,
                previousPeriod.sourceToOfferRate.Indeed
              ),
              Referral: calculatePercentChange(
                currentPeriod.sourceToOfferRate.Referral,
                previousPeriod.sourceToOfferRate.Referral
              ),
              Website: calculatePercentChange(
                currentPeriod.sourceToOfferRate.Website,
                previousPeriod.sourceToOfferRate.Website
              ),
              Other: calculatePercentChange(
                currentPeriod.sourceToOfferRate.Other,
                previousPeriod.sourceToOfferRate.Other
              ),
            },
          },
        }
      : currentPeriod;
  await setReportsCache(cacheKey, payload);
  return withReportsTelemetry(NextResponse.json(payload), {
    endpoint: "/api/reports/source",
    role: String(role),
    startedAt,
    cacheHit: "miss",
    queryTimeMs: Date.now() - dbStartedAt,
  });
}

