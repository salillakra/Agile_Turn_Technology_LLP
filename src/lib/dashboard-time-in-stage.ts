import type { ApplicationStage } from "@prisma/client";
import type { StageChangeDetails } from "@/src/lib/activity-log-details";
import { prisma } from "@/src/lib/prisma";

const MS_PER_DAY = 86_400_000;

type ApplicationCreatedAtClause =
  | { gte: Date }
  | { gte: Date; lt: Date };

const STAGE_CHANGE_ACTION = "STAGE_CHANGE";

const TRACKED_STAGES: ApplicationStage[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
];

const VALID_STAGE = new Set<ApplicationStage>([
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
  "REJECTED",
]);

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseStageChangeDetails(
  details: string | null
): { from: ApplicationStage; to: ApplicationStage } | null {
  if (details == null || details === "") return null;
  try {
    const obj = JSON.parse(details) as unknown;
    if (obj == null || typeof obj !== "object") return null;
    const from = (obj as StageChangeDetails).from;
    const to = (obj as StageChangeDetails).to;
    if (typeof from !== "string" || typeof to !== "string") return null;
    if (!VALID_STAGE.has(from as ApplicationStage) || !VALID_STAGE.has(to as ApplicationStage)) {
      return null;
    }
    return { from: from as ApplicationStage, to: to as ApplicationStage };
  } catch {
    return null;
  }
}

/** Average completed dwell time per stage from ActivityLog STAGE_CHANGE (ms → days). */
export type DashboardTimeInStageAverages = {
  appliedAvgDays: number;
  screeningAvgDays: number;
  interviewAvgDays: number;
  technicalAvgDays: number;
  finalRoundAvgDays: number;
  offerSentAvgDays: number;
};

function emptyAverages(): DashboardTimeInStageAverages {
  return {
    appliedAvgDays: 0,
    screeningAvgDays: 0,
    interviewAvgDays: 0,
    technicalAvgDays: 0,
    finalRoundAvgDays: 0,
    offerSentAvgDays: 0,
  };
}

function toAverages(agg: Map<ApplicationStage, { sumMs: number; n: number }>): DashboardTimeInStageAverages {
  const out = emptyAverages();
  const keyMap: Record<string, keyof DashboardTimeInStageAverages> = {
    APPLIED: "appliedAvgDays",
    SCREENING: "screeningAvgDays",
    INTERVIEW: "interviewAvgDays",
    TECHNICAL: "technicalAvgDays",
    FINAL_ROUND: "finalRoundAvgDays",
    OFFER_SENT: "offerSentAvgDays",
  };
  for (const stage of TRACKED_STAGES) {
    const row = agg.get(stage);
    const k = keyMap[stage];
    if (!row || row.n === 0 || !k) continue;
    out[k] = roundToTwo(row.sumMs / row.n / MS_PER_DAY);
  }
  return out;
}

/**
 * Mean time-in-stage from `ActivityLog` STAGE_CHANGE rows (exit timestamp = end of stage `from`).
 * Only **completed** segments are counted (a transition out of the stage exists). Uses `Application.createdAt`
 * as entry into APPLIED when no earlier log exists.
 */
export async function computeDashboardTimeInStageAverages(
  jobScope: { jobId?: { in: string[] } },
  createdAt: ApplicationCreatedAtClause | undefined
): Promise<DashboardTimeInStageAverages> {
  const applicationsWhere = {
    withdrawnAt: null as null,
    ...jobScope,
    ...(createdAt ? { createdAt } : {}),
  };

  const applications = await prisma.application.findMany({
    where: applicationsWhere,
    select: { id: true, createdAt: true },
  });

  if (applications.length === 0) {
    return emptyAverages();
  }

  const appById = new Map(applications.map((a) => [a.id, a] as const));
  const ids = applications.map((a) => a.id);

  const logs = await prisma.activityLog.findMany({
    where: {
      applicationId: { in: ids },
      action: STAGE_CHANGE_ACTION,
    },
    select: { applicationId: true, createdAt: true, details: true },
    orderBy: { createdAt: "asc" },
  });

  const logsByApp = new Map<string, typeof logs>();
  for (const log of logs) {
    const aid = log.applicationId;
    if (!aid) continue;
    const list = logsByApp.get(aid) ?? [];
    list.push(log);
    logsByApp.set(aid, list);
  }

  const agg = new Map<ApplicationStage, { sumMs: number; n: number }>();

  for (const [applicationId, appLogs] of logsByApp) {
    const app = appById.get(applicationId);
    if (!app) continue;

    const sorted = [...appLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let currentStage: ApplicationStage = "APPLIED";
    let stageStartMs = app.createdAt.getTime();

    for (const log of sorted) {
      const parsed = parseStageChangeDetails(log.details);
      if (!parsed) continue;
      const { from, to } = parsed;
      const t = log.createdAt.getTime();

      if (from === currentStage && t >= stageStartMs) {
        const dur = t - stageStartMs;
        if (dur >= 0) {
          const cur = agg.get(from) ?? { sumMs: 0, n: 0 };
          cur.sumMs += dur;
          cur.n += 1;
          agg.set(from, cur);
        }
      }

      currentStage = to;
      stageStartMs = t;
    }
  }

  return toAverages(agg);
}
