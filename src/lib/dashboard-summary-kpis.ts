import { prisma } from "@/src/lib/prisma";
import {
  calculateActivePipelineCount,
  calculateAverageTimeToHire,
  calculateConversionRate,
  calculateOfferRate,
  computeDashboardFunnelRates,
} from "@/src/lib/metrics";

export type ApplicationCreatedAtClause =
  | { gte: Date }
  | { gte: Date; lt: Date };

export type DashboardSummaryApplicationKpis = {
  totalCandidates: number;
  totalApplications: number;
  activePipelineCount: number;
  hiredCount: number;
  rejectedCount: number;
  offerSentCount: number;
  offerRate: number;
  conversionRate: number;
  averageTimeToHire: number;
  appliedToScreeningRate: number;
  screeningToInterviewRate: number;
  interviewToHireRate: number;
};

/** Application-only KPIs for one `createdAt` window (current: gte only; previous: gte+lt). */
export async function computeDashboardSummaryApplicationKpis(
  jobScope: { jobId?: { in: string[] } },
  createdAt: ApplicationCreatedAtClause | undefined
): Promise<DashboardSummaryApplicationKpis> {
  const applicationsWhere = {
    withdrawnAt: null as null,
    ...jobScope,
    ...(createdAt ? { createdAt } : {}),
  };

  const [applicationStageCounts, candidateGroups, hiredApplications] = await Promise.all([
    prisma.application.groupBy({
      by: ["stage"],
      where: applicationsWhere,
      _count: { id: true },
    }),
    prisma.application.groupBy({
      by: ["candidateId"],
      where: applicationsWhere,
      _count: { id: true },
    }),
    prisma.application.findMany({
      where: { ...applicationsWhere, stage: "HIRED" },
      select: { createdAt: true, hiredAt: true },
    }),
  ]);

  const totalCandidates = candidateGroups.length;

  const stageCounts = new Map(
    applicationStageCounts.map((row) => [row.stage, row._count.id] as const)
  );
  const totalApplications = applicationStageCounts.reduce(
    (sum, row) => sum + row._count.id,
    0
  );
  const hiredCount = stageCounts.get("HIRED") ?? 0;
  const rejectedCount = stageCounts.get("REJECTED") ?? 0;
  const offerSentCount = stageCounts.get("OFFER_SENT") ?? 0;
  const activePipelineCount = calculateActivePipelineCount(
    totalApplications,
    hiredCount,
    rejectedCount
  );

  const offerRate = calculateOfferRate(offerSentCount, totalApplications);
  const conversionRate = calculateConversionRate(hiredCount, totalApplications);

  const { appliedToScreeningRate, screeningToInterviewRate, interviewToHireRate } =
    computeDashboardFunnelRates(stageCounts);

  let averageTimeToHire = 0;
  if (hiredApplications.length > 0) {
    const durationsInDays: number[] = [];
    for (const app of hiredApplications) {
      const hiredAt = app.hiredAt;
      if (!hiredAt) continue;
      const days =
        (hiredAt.getTime() - app.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (days >= 0) durationsInDays.push(days);
    }
    averageTimeToHire = calculateAverageTimeToHire(durationsInDays);
  }

  return {
    totalCandidates,
    totalApplications,
    activePipelineCount,
    hiredCount,
    rejectedCount,
    offerSentCount,
    offerRate,
    conversionRate,
    averageTimeToHire,
    appliedToScreeningRate,
    screeningToInterviewRate,
    interviewToHireRate,
  };
}
