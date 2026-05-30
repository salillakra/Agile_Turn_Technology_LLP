import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { isAdmin } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { pipelineStatsCacheKey } from "@/src/lib/cache/cache-keys";
import { getCache, setCache } from "@/src/lib/cache/cache-utils";
import { getDashboardAnalyticsCacheTtlMs } from "@/src/lib/dashboard-analytics-cache";
import type { ApplicationStage } from "@prisma/client";

export const runtime = "nodejs";

const STAGES: ApplicationStage[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
  "REJECTED",
];

const STAGE_TO_KEY: Record<ApplicationStage, string> = {
  APPLIED: "appliedCount",
  SCREENING: "screeningCount",
  INTERVIEW: "interviewCount",
  TECHNICAL: "technicalCount",
  FINAL_ROUND: "finalRoundCount",
  OFFER_SENT: "offerSentCount",
  HIRED: "hiredCount",
  REJECTED: "rejectedCount",
};

function emptyStats(): Record<string, number> {
  return STAGES.reduce(
    (acc, stage) => ({ ...acc, [STAGE_TO_KEY[stage]]: 0 }),
    {} as Record<string, number>
  );
}

/**
 * GET /api/pipeline/stats — application counts per stage for recruitment analytics dashboards.
 * Optional jobId: counts for that job only; omit for global counts.
 * Cache: Redis TTL 5–15 min (`DASHBOARD_ANALYTICS_CACHE_TTL_SEC`), key `ats:v1:dashboard:pipeline:stats:...`
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";

  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() || undefined;

  const cacheKey = pipelineStatsCacheKey({ role, userId, jobId });
  const cached = await getCache<Record<string, number>>(cacheKey);
  if (cached.hit && cached.value != null) {
    const res = NextResponse.json(cached.value);
    res.headers.set("X-Cache-Pipeline-Stats", "HIT");
    return res;
  }

  const allowedJobIds = isAdmin(role)
    ? null
    : (
        await prisma.jobAssignment.findMany({
          where: { userId },
          select: { jobId: true },
          distinct: ["jobId"],
        })
      ).map((r) => r.jobId);

  if (jobId && allowedJobIds != null && !allowedJobIds.includes(jobId)) {
    const stats = emptyStats();
    await setCache(cacheKey, stats, { ttlMs: getDashboardAnalyticsCacheTtlMs() });
    const res = NextResponse.json(stats);
    res.headers.set("X-Cache-Pipeline-Stats", "MISS");
    return res;
  }

  const where = {
    withdrawnAt: null as null,
    ...(jobId ? { jobId } : {}),
    ...(!jobId && allowedJobIds != null ? { jobId: { in: allowedJobIds } } : {}),
  };

  const counts = await prisma.application.groupBy({
    by: ["stage"],
    where,
    _count: { id: true },
  });

  const stats = emptyStats();
  for (const row of counts) {
    stats[STAGE_TO_KEY[row.stage]] = row._count.id;
  }

  await setCache(cacheKey, stats, { ttlMs: getDashboardAnalyticsCacheTtlMs() });

  const res = NextResponse.json(stats);
  res.headers.set("X-Cache-Pipeline-Stats", "MISS");
  return res;
}
