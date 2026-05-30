import {
  ACTIVITY_ACTION_AI_SEARCH_PERFORMED,
  ACTIVITY_ACTION_CANDIDATE_AI_MATCHED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_EXECUTED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_RESULT_CLICKED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_SHORTLISTED,
  type AiSearchPerformedDetails,
  type CandidateAiMatchedDetails,
  type RecruiterAiSearchExecutedDetails,
  type RecruiterAiSearchClickDetails,
  type RecruiterAiSearchShortlistDetails,
} from "@/src/lib/activity-log-details";
import { prisma } from "@/src/lib/prisma";

export type RecruiterSearchAnalyticsOptions = {
  /** Only include logs at or after this instant (UTC). */
  since: Date;
  /** When set, restrict to this recruiter's `userId`. */
  userId?: string;
};

export type SkillSearchCount = {
  skill: string;
  searchCount: number;
};

export type RecruiterSearchAnalyticsSummary = {
  periodStart: string;
  totalSearches: number;
  successfulSearches: number;
  /** Percent of searches with ≥1 result (0–100, one decimal). */
  searchSuccessRate: number;
  mostSearchedSkills: SkillSearchCount[];
  /** Total click events on search results. */
  clickedRecommendations: number;
  /** Distinct search sessions with at least one click. */
  searchSessionsWithClicks: number;
  /** Distinct search sessions that led to a pipeline shortlist. */
  searchSessionsWithShortlist: number;
  /** searchSessionsWithShortlist / totalSearches (0–100, one decimal). */
  searchToShortlistConversionRate: number;
  /** Click-through: clicks / total results returned across searches (0–100). */
  resultClickThroughRate: number;
};

function roundPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function parseJsonDetails<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const SEARCH_ACTIONS = [
  ACTIVITY_ACTION_AI_SEARCH_PERFORMED,
  ACTIVITY_ACTION_CANDIDATE_AI_MATCHED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_EXECUTED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_RESULT_CLICKED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_SHORTLISTED,
] as const;

/**
 * Aggregate recruiter AI search metrics from `ActivityLog` rows.
 */
export async function getRecruiterSearchAnalytics(
  options: RecruiterSearchAnalyticsOptions
): Promise<RecruiterSearchAnalyticsSummary> {
  const rows = await prisma.activityLog.findMany({
    where: {
      action: { in: [...SEARCH_ACTIONS] },
      createdAt: { gte: options.since },
      ...(options.userId ? { userId: options.userId } : {}),
    },
    select: {
      action: true,
      details: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50_000,
  });

  const skillCounts = new Map<string, number>();
  const searchIds = new Set<string>();
  const successfulSearchIds = new Set<string>();
  let totalResultsReturned = 0;
  const clickSearchIds = new Set<string>();
  let clickedRecommendations = 0;
  const shortlistSearchIds = new Set<string>();

  for (const row of rows) {
    if (row.action === ACTIVITY_ACTION_AI_SEARCH_PERFORMED) {
      const details = parseJsonDetails<AiSearchPerformedDetails>(row.details);
      if (!details?.searchId) continue;
      searchIds.add(details.searchId);
      if (details.success) {
        successfulSearchIds.add(details.searchId);
      }
      totalResultsReturned += details.resultCount ?? 0;
      for (const skill of details.querySkillTokens ?? []) {
        const key = skill.trim().toLowerCase();
        if (!key) continue;
        skillCounts.set(key, (skillCounts.get(key) ?? 0) + 1);
      }
      continue;
    }

    if (row.action === ACTIVITY_ACTION_CANDIDATE_AI_MATCHED) {
      const details = parseJsonDetails<CandidateAiMatchedDetails>(row.details);
      if (!details?.searchId) continue;
      totalResultsReturned += 1;
      continue;
    }

    if (row.action === ACTIVITY_ACTION_RECRUITER_AI_SEARCH_EXECUTED) {
      const details = parseJsonDetails<RecruiterAiSearchExecutedDetails>(row.details);
      if (!details?.searchId) continue;
      if (!searchIds.has(details.searchId)) {
        searchIds.add(details.searchId);
        if (details.success) {
          successfulSearchIds.add(details.searchId);
        }
        totalResultsReturned += details.resultCount ?? 0;
        for (const skill of details.querySkillTokens ?? []) {
          const key = skill.trim().toLowerCase();
          if (!key) continue;
          skillCounts.set(key, (skillCounts.get(key) ?? 0) + 1);
        }
      }
      continue;
    }

    if (row.action === ACTIVITY_ACTION_RECRUITER_AI_SEARCH_RESULT_CLICKED) {
      const details = parseJsonDetails<RecruiterAiSearchClickDetails>(row.details);
      if (!details?.searchId) continue;
      if (details.clickType === "RESULT_IMPRESSION") continue;
      clickedRecommendations += 1;
      clickSearchIds.add(details.searchId);
      continue;
    }

    if (row.action === ACTIVITY_ACTION_RECRUITER_AI_SEARCH_SHORTLISTED) {
      const details = parseJsonDetails<RecruiterAiSearchShortlistDetails>(row.details);
      if (!details?.searchId) continue;
      shortlistSearchIds.add(details.searchId);
    }
  }

  const totalSearches = searchIds.size;
  const successfulSearches = successfulSearchIds.size;
  const mostSearchedSkills = [...skillCounts.entries()]
    .map(([skill, searchCount]) => ({ skill, searchCount }))
    .sort((a, b) => {
      if (b.searchCount !== a.searchCount) return b.searchCount - a.searchCount;
      return a.skill.localeCompare(b.skill);
    })
    .slice(0, 15);

  return {
    periodStart: options.since.toISOString(),
    totalSearches,
    successfulSearches,
    searchSuccessRate: roundPercent(successfulSearches, totalSearches),
    mostSearchedSkills,
    clickedRecommendations,
    searchSessionsWithClicks: clickSearchIds.size,
    searchSessionsWithShortlist: shortlistSearchIds.size,
    searchToShortlistConversionRate: roundPercent(shortlistSearchIds.size, totalSearches),
    resultClickThroughRate: roundPercent(clickedRecommendations, totalResultsReturned),
  };
}
