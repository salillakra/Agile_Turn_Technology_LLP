import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/src/lib/dashboard-api";
import { prisma } from "@/src/lib/prisma";
import { calculateFraction } from "@/src/lib/metrics";
import type { ApplicationStage } from "@prisma/client";
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
import { scheduleAnalyticsCacheRefresh } from "@/src/lib/enqueue-analytics-refresh";

export const runtime = "nodejs";

function parseCompareFlag(value: string | null): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

const ALL_STAGES: ApplicationStage[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
  "REJECTED",
];

const PIPELINE_ORDER: ApplicationStage[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
];

/** GET /api/reports/pipeline
 * Purpose: stage breakdown report.
 *
 * Returns:
 * - applications count per stage (excluding withdrawn applications)
 * - conversion percentages between adjacent stages in the hiring pipeline
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = await requireDashboardAuth();
  if (auth instanceof NextResponse) return auth;

  const { session } = auth;
  const role = session.user?.role ?? "UNKNOWN";
  const userId = session.user?.id;

  const { searchParams } = new URL(request.url);
  const rangeRaw = searchParams.get("range");
  const range = parseDashboardRange(rangeRaw);
  if (range == null) {
    return NextResponse.json(
      {
        error: "INVALID_RANGE",
        message: "range must be one of: 7d, 30d, 90d, all",
      },
      { status: 400 }
    );
  }

  const jobId = searchParams.get("jobId");
  const department = searchParams.get("department");
  const compare = parseCompareFlag(searchParams.get("compare"));
  if (compare && range === "all") {
    return NextResponse.json(
      {
        error: "INVALID_COMPARE",
        message: "compare=true requires a bounded range (7d, 30d, or 90d), not all",
      },
      { status: 400 }
    );
  }
  const cacheKey = buildReportsCacheKey({
    endpoint: "pipeline",
    role: String(role),
    userId,
    range,
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
      endpoint: "/api/reports/pipeline",
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
      return NextResponse.json(
        { error: "INVALID_JOB_ID", message: "Malformed jobId format" },
        { status: 400 }
      );
    }
    throw e;
  }

  if (jobScopeInfo.jobIds != null && jobScopeInfo.jobIds.length === 0) {
    const empty = {
      applicationsByStage: {
        APPLIED: 0,
        SCREENING: 0,
        INTERVIEW: 0,
        TECHNICAL: 0,
        FINAL_ROUND: 0,
        OFFER_SENT: 0,
        HIRED: 0,
        REJECTED: 0,
      },
      conversionRates: {
        APPLIED_TO_SCREENING: 0,
        SCREENING_TO_INTERVIEW: 0,
        INTERVIEW_TO_TECHNICAL: 0,
        TECHNICAL_TO_FINAL_ROUND: 0,
        FINAL_ROUND_TO_OFFER_SENT: 0,
        OFFER_SENT_TO_HIRED: 0,
      },
    };
    const compareEmpty =
      compare
        ? {
            currentPeriod: empty,
            previousPeriod: empty,
            percentageChange: {
              applicationsByStage: {
                APPLIED: 0,
                SCREENING: 0,
                INTERVIEW: 0,
                TECHNICAL: 0,
                FINAL_ROUND: 0,
                OFFER_SENT: 0,
                HIRED: 0,
                REJECTED: 0,
              },
              conversionRates: {
                APPLIED_TO_SCREENING: 0,
                SCREENING_TO_INTERVIEW: 0,
                INTERVIEW_TO_TECHNICAL: 0,
                TECHNICAL_TO_FINAL_ROUND: 0,
                FINAL_ROUND_TO_OFFER_SENT: 0,
                OFFER_SENT_TO_HIRED: 0,
              },
            },
          }
        : empty;
    await setReportsCache(cacheKey, compareEmpty);
    return withReportsTelemetry(NextResponse.json(compareEmpty), {
      endpoint: "/api/reports/pipeline",
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

  async function computeForFilter(filter: { gte: Date } | { gte: Date; lt: Date } | undefined) {
    const stageAgg = await prisma.application.groupBy({
      by: ["stage"],
      where: {
        withdrawnAt: null,
        ...(filter ? { createdAt: filter } : {}),
        ...jobScope,
      },
      _count: { id: true },
    });

    const stageCounts = new Map<ApplicationStage, number>(
      stageAgg.map((row) => [row.stage, row._count.id])
    );
    const applicationsByStage = Object.fromEntries(
      ALL_STAGES.map((s) => [s, stageCounts.get(s) ?? 0])
    ) as Record<ApplicationStage, number>;

    const sumFromIndex = (startIdx: number): number => {
      let total = 0;
      for (let i = startIdx; i < PIPELINE_ORDER.length; i++) {
        total += stageCounts.get(PIPELINE_ORDER[i]!) ?? 0;
      }
      return total;
    };

    const conversionRates = {
      APPLIED_TO_SCREENING: calculateFraction(
        sumFromIndex(1),
        sumFromIndex(0) + (stageCounts.get("REJECTED") ?? 0)
      ),
      SCREENING_TO_INTERVIEW: calculateFraction(sumFromIndex(2), sumFromIndex(1)),
      INTERVIEW_TO_TECHNICAL: calculateFraction(sumFromIndex(3), sumFromIndex(2)),
      TECHNICAL_TO_FINAL_ROUND: calculateFraction(sumFromIndex(4), sumFromIndex(3)),
      FINAL_ROUND_TO_OFFER_SENT: calculateFraction(sumFromIndex(5), sumFromIndex(4)),
      OFFER_SENT_TO_HIRED: calculateFraction(sumFromIndex(6), sumFromIndex(5)),
    };
    return { applicationsByStage, conversionRates };
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
            applicationsByStage: {
              APPLIED: calculatePercentChange(
                currentPeriod.applicationsByStage.APPLIED,
                previousPeriod.applicationsByStage.APPLIED
              ),
              SCREENING: calculatePercentChange(
                currentPeriod.applicationsByStage.SCREENING,
                previousPeriod.applicationsByStage.SCREENING
              ),
              INTERVIEW: calculatePercentChange(
                currentPeriod.applicationsByStage.INTERVIEW,
                previousPeriod.applicationsByStage.INTERVIEW
              ),
              TECHNICAL: calculatePercentChange(
                currentPeriod.applicationsByStage.TECHNICAL,
                previousPeriod.applicationsByStage.TECHNICAL
              ),
              FINAL_ROUND: calculatePercentChange(
                currentPeriod.applicationsByStage.FINAL_ROUND,
                previousPeriod.applicationsByStage.FINAL_ROUND
              ),
              OFFER_SENT: calculatePercentChange(
                currentPeriod.applicationsByStage.OFFER_SENT,
                previousPeriod.applicationsByStage.OFFER_SENT
              ),
              HIRED: calculatePercentChange(
                currentPeriod.applicationsByStage.HIRED,
                previousPeriod.applicationsByStage.HIRED
              ),
              REJECTED: calculatePercentChange(
                currentPeriod.applicationsByStage.REJECTED,
                previousPeriod.applicationsByStage.REJECTED
              ),
            },
            conversionRates: {
              APPLIED_TO_SCREENING: calculatePercentChange(
                currentPeriod.conversionRates.APPLIED_TO_SCREENING,
                previousPeriod.conversionRates.APPLIED_TO_SCREENING
              ),
              SCREENING_TO_INTERVIEW: calculatePercentChange(
                currentPeriod.conversionRates.SCREENING_TO_INTERVIEW,
                previousPeriod.conversionRates.SCREENING_TO_INTERVIEW
              ),
              INTERVIEW_TO_TECHNICAL: calculatePercentChange(
                currentPeriod.conversionRates.INTERVIEW_TO_TECHNICAL,
                previousPeriod.conversionRates.INTERVIEW_TO_TECHNICAL
              ),
              TECHNICAL_TO_FINAL_ROUND: calculatePercentChange(
                currentPeriod.conversionRates.TECHNICAL_TO_FINAL_ROUND,
                previousPeriod.conversionRates.TECHNICAL_TO_FINAL_ROUND
              ),
              FINAL_ROUND_TO_OFFER_SENT: calculatePercentChange(
                currentPeriod.conversionRates.FINAL_ROUND_TO_OFFER_SENT,
                previousPeriod.conversionRates.FINAL_ROUND_TO_OFFER_SENT
              ),
              OFFER_SENT_TO_HIRED: calculatePercentChange(
                currentPeriod.conversionRates.OFFER_SENT_TO_HIRED,
                previousPeriod.conversionRates.OFFER_SENT_TO_HIRED
              ),
            },
          },
        }
      : currentPeriod;
  await setReportsCache(cacheKey, payload);
  return withReportsTelemetry(NextResponse.json(payload), {
    endpoint: "/api/reports/pipeline",
    role: String(role),
    startedAt,
    cacheHit: "miss",
    queryTimeMs: Date.now() - dbStartedAt,
  });
}

