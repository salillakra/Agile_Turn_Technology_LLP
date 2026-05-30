import {
  ACTIVITY_ACTION_RECOMMENDATION_ACCEPTED,
  ACTIVITY_ACTION_RECOMMENDATION_GENERATED,
  buildRecommendationActivityDetails,
  serializeActivityLogDetails,
  type RecommendationActivityJobRef,
} from "@/src/lib/activity-log-details";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

const MAX_JOBS_IN_DETAILS = 50;

function capJobRefs(jobs: RecommendationActivityJobRef[]): RecommendationActivityJobRef[] {
  return jobs.slice(0, MAX_JOBS_IN_DETAILS);
}

/** Parse API/UI payload into normalized job refs for activity details. */
export function parseRecommendationActivityJobRefs(
  input: unknown
): RecommendationActivityJobRef[] {
  if (!Array.isArray(input)) return [];

  const out: RecommendationActivityJobRef[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (typeof item === "string") {
      const jobId = item.trim();
      if (!jobId || !isValidCuid(jobId) || seen.has(jobId)) continue;
      seen.add(jobId);
      out.push({ jobId });
      continue;
    }

    if (item == null || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const jobId = typeof raw.jobId === "string" ? raw.jobId.trim() : "";
    if (!jobId || !isValidCuid(jobId) || seen.has(jobId)) continue;
    seen.add(jobId);

    const ref: RecommendationActivityJobRef = { jobId };
    if (typeof raw.title === "string" && raw.title.trim()) {
      ref.title = raw.title.trim();
    }
    if (typeof raw.matchScore === "number" && Number.isFinite(raw.matchScore)) {
      ref.matchScore = raw.matchScore;
    }
    out.push(ref);
  }

  return out;
}

/** Enrich selected job ids with title/score from the recommendation list when available. */
export function buildSelectedRecommendationJobs(
  selectedJobIds: readonly string[],
  recommendedJobs: readonly RecommendationActivityJobRef[]
): RecommendationActivityJobRef[] {
  const byId = new Map(recommendedJobs.map((j) => [j.jobId, j]));
  const out: RecommendationActivityJobRef[] = [];
  const seen = new Set<string>();

  for (const raw of selectedJobIds) {
    if (typeof raw !== "string") continue;
    const jobId = raw.trim();
    if (!jobId || !isValidCuid(jobId) || seen.has(jobId)) continue;
    seen.add(jobId);
    out.push(byId.get(jobId) ?? { jobId });
  }

  return out;
}

async function persistRecommendationActivityLog(params: {
  action:
    | typeof ACTIVITY_ACTION_RECOMMENDATION_GENERATED
    | typeof ACTIVITY_ACTION_RECOMMENDATION_ACCEPTED;
  candidateId: string;
  userId: string | undefined;
  recommendedJobs: RecommendationActivityJobRef[];
  selectedJobs: RecommendationActivityJobRef[];
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const detailsObj = buildRecommendationActivityDetails(
    params.candidateId,
    capJobRefs(params.recommendedJobs),
    capJobRefs(params.selectedJobs)
  );

  const serialized = serializeActivityLogDetails(detailsObj);
  if (serialized.ok === false) {
    return { ok: false, reason: serialized.code };
  }

  await prisma.activityLog.create({
    data: {
      candidateId: params.candidateId,
      userId: params.userId ?? null,
      action: params.action,
      details: serialized.json,
    },
  });

  return { ok: true };
}

export async function logRecommendationGenerated(params: {
  candidateId: string;
  userId: string | undefined;
  recommendedJobs: RecommendationActivityJobRef[];
}): Promise<void> {
  await persistRecommendationActivityLog({
    action: ACTIVITY_ACTION_RECOMMENDATION_GENERATED,
    candidateId: params.candidateId,
    userId: params.userId,
    recommendedJobs: params.recommendedJobs,
    selectedJobs: [],
  });
}

export async function logRecommendationAccepted(params: {
  candidateId: string;
  userId: string | undefined;
  recommendedJobs: RecommendationActivityJobRef[];
  selectedJobs: RecommendationActivityJobRef[];
}): Promise<void> {
  await persistRecommendationActivityLog({
    action: ACTIVITY_ACTION_RECOMMENDATION_ACCEPTED,
    candidateId: params.candidateId,
    userId: params.userId,
    recommendedJobs: params.recommendedJobs,
    selectedJobs: params.selectedJobs,
  });
}
