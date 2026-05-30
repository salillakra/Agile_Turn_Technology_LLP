import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import type { CandidateRecommendationPoolItem } from "@/src/lib/candidate-recommendation-engine";
import { isCandidateExcludedFromJobRecommendations } from "@/src/lib/candidate-identity";
import {
  normalizeCandidateEmail,
  normalizeCandidateName,
} from "@/src/lib/candidate-identity";
import { buildCandidateVisibilityWhere, canAccessJobByScope } from "@/src/lib/rbac-scope";
import { canViewCandidates, isAdmin } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { normalizeSkills } from "@/src/lib/skill-normalizer";
import { isValidCuid } from "@/src/lib/validate-id";
import { logCandidateScored, logHighMatchFound } from "@/src/lib/ai-candidate-score-activity-log";
import { resolveCandidateScoringThresholds } from "@/src/lib/ai/candidate-scoring-thresholds";
import {
  buildCandidateScoringScopeKey,
  getCachedCandidateScores,
  scoringJobFingerprint,
} from "@/src/lib/ai/candidate-scoring-cache";
import { buildJobCandidateScores } from "@/src/lib/ai/job-candidate-scoring-service";
import type { JobCandidateScoresResponseRow } from "@/src/lib/ai/job-candidate-scoring-service";

type RouteContext = { params: Promise<{ id: string }> };

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = value != null ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clampPercent(value: string | null, fallback: number): number {
  const n = value != null ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function toPoolItem(row: {
  id: string;
  candidateName: string;
  email: string;
  embedding: unknown;
  skills: string[];
  normalizedSkills: string[];
  totalExperience: number | null;
  relevantExperience: number | null;
  preferredWorkLocation: string | null;
  currentDesignation: string | null;
  currentCompany: string | null;
  positionRole: string | null;
  summary: string | null;
  companies: string[];
  education: unknown;
  certifications: string[];
  updatedAt: Date;
  embeddingUpdatedAt: Date | null;
  candidateSkills: { skillName: string; createdAt: Date }[];
}): CandidateRecommendationPoolItem & {
  summary: string | null;
  companies: string[];
  education: unknown;
  certifications: string[];
  updatedAt: Date;
  currentCompany: string | null;
  candidateSkills: { skillName: string; createdAt: Date }[];
} {
  const rawSkills =
    row.skills.length > 0 ? row.skills : row.candidateSkills.map((s) => s.skillName).filter(Boolean);
  const normalizedSkills =
    row.normalizedSkills.length > 0 ? row.normalizedSkills : normalizeSkills(rawSkills);

  return {
    id: row.id,
    candidateName: row.candidateName,
    email: row.email,
    embedding: row.embedding,
    skills: rawSkills,
    normalizedSkills,
    totalExperience: row.totalExperience,
    relevantExperience: row.relevantExperience,
    preferredWorkLocation: row.preferredWorkLocation,
    currentDesignation: row.currentDesignation,
    currentCompany: row.currentCompany,
    positionRole: row.positionRole,
    summary: row.summary,
    companies: row.companies ?? [],
    education: row.education,
    certifications: row.certifications ?? [],
    updatedAt: row.updatedAt,
    candidateSkills: row.candidateSkills ?? [],
  };
}

function candidateDedupeKey(row: { candidateName: string; email?: string | null; id: string }): string {
  const email = normalizeCandidateEmail(row.email);
  if (email) return `email:${email}`;
  const name = normalizeCandidateName(row.candidateName);
  if (name.length >= 2) return `name:${name}`;
  return `id:${row.id}`;
}

function shouldPreferCandidateRow(
  next: ReturnType<typeof toPoolItem>,
  prev: ReturnType<typeof toPoolItem>
): boolean {
  // Prefer rows with embeddings (semantic), then freshest updates, then lexicographic id.
  const nextHasEmbedding = next.embedding != null;
  const prevHasEmbedding = prev.embedding != null;
  if (nextHasEmbedding !== prevHasEmbedding) return nextHasEmbedding;
  const nextUpdated = next.updatedAt instanceof Date ? next.updatedAt.getTime() : 0;
  const prevUpdated = prev.updatedAt instanceof Date ? prev.updatedAt.getTime() : 0;
  if (nextUpdated !== prevUpdated) return nextUpdated > prevUpdated;
  return next.id.localeCompare(prev.id) < 0;
}

/**
 * GET /api/jobs/[id]/candidate-scores
 *
 * 1. Fetch job (RBAC).
 * 2. Build candidate pool (same visibility/exclusion rules as recommendations).
 * 3. Redis cache: semantic pgvector ranking + full scored result list (TTL invalidation).
 * 4. Compute hybrid candidate fit scores and return ranked explainable results.
 *
 * Query:
 * - `limit` (default 50, max 200)
 * - `minScore` (default from job thresholds) — filters by `candidateFitScore`
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  const jobId = typeof id === "string" ? id.trim() : "";
  if (!jobId || !isValidCuid(jobId)) {
    return apiError("INVALID_ID", "Malformed job id", 400);
  }

  const searchParams = new URL(request.url).searchParams;
  const limit = clampInt(searchParams.get("limit"), 50, 1, 200);

  try {
    if (!(await canAccessJobByScope(role, userId, jobId))) {
      return apiError("FORBIDDEN", "You do not have access to this job", 403);
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        location: true,
        yearsOfExperience: true,
        requiredSkills: true,
        preferredSkills: true,
        jobMeta: true,
        embedding: true,
        embeddingUpdatedAt: true,
      },
    });
    if (!job) {
      return apiError("NOT_FOUND", "Job not found", 404);
    }

    const thresholds = resolveCandidateScoringThresholds(job.jobMeta);
    const minScore = clampPercent(searchParams.get("minScore"), thresholds.minimumAcceptableScore);
    const scopeKey = buildCandidateScoringScopeKey(role, userId);
    const jobFingerprint = scoringJobFingerprint({
      jobId: job.id,
      jobMeta: job.jobMeta,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      yearsOfExperience: job.yearsOfExperience,
      location: job.location,
      title: job.title,
      embedding: job.embedding,
      embeddingUpdatedAt: job.embeddingUpdatedAt,
    });

    const cachedEarly = await getCachedCandidateScores({
      jobId,
      scopeKey,
      limit,
      minScore,
      thresholds,
      jobFingerprint,
    });

    if (cachedEarly) {
      const filtered = cachedEarly.results as JobCandidateScoresResponseRow[];
      return NextResponse.json(filtered, {
        headers: {
          "X-Job-Id": jobId,
          "X-Candidate-Score-Result-Count": String(filtered.length),
          "X-Candidate-Score-Min-Score": String(minScore),
          "X-Candidate-Score-Min-Acceptable": String(thresholds.minimumAcceptableScore),
          "X-Candidate-Score-High-Priority": String(thresholds.highPriorityThreshold),
          "X-Candidate-Score-Auto-Shortlist": String(thresholds.autoShortlistThreshold),
          "X-Cache-Candidate-Scores": "hit",
          "X-Cache-Semantic-Ranking": "skipped",
          "X-Cache-Hybrid-Fit": "skipped",
        },
      });
    }

    const scopeWhere = isAdmin(role)
      ? {}
      : {
          OR: [
            buildCandidateVisibilityWhere(role, userId),
            { applications: { none: {} } },
          ],
        };

    const candidates = await prisma.candidate.findMany({
      where: scopeWhere,
      select: {
        id: true,
        candidateName: true,
        email: true,
        embedding: true,
        embeddingUpdatedAt: true,
        skills: true,
        normalizedSkills: true,
        totalExperience: true,
        relevantExperience: true,
        preferredWorkLocation: true,
        currentDesignation: true,
        currentCompany: true,
        positionRole: true,
        summary: true,
        companies: true,
        education: true,
        certifications: true,
        updatedAt: true,
        candidateSkills: {
          select: { skillName: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });

    const poolByIdentity = new Map<string, ReturnType<typeof toPoolItem>>();
    for (const row of candidates) {
      const item = toPoolItem(row);
      if (await isCandidateExcludedFromJobRecommendations(item, jobId)) continue;
      const key = candidateDedupeKey({ id: item.id, candidateName: item.candidateName, email: item.email });
      const prev = poolByIdentity.get(key);
      if (!prev || shouldPreferCandidateRow(item, prev)) {
        poolByIdentity.set(key, item);
      }
    }
    const pool = [...poolByIdentity.values()];

    const { results: filtered, cache } = await buildJobCandidateScores({
      job,
      pool,
      role,
      userId,
      limit,
      minScore,
      thresholds,
    });

    if (cache.results === "miss") {
      for (let i = 0; i < Math.min(filtered.length, 50); i += 1) {
        const row = filtered[i]!;
        void logCandidateScored({
          jobId,
          candidateId: row.candidate.id,
          userId,
          candidateFitScore: row.candidateFitScore,
        });
        if (row.candidateFitScore >= thresholds.highPriorityThreshold) {
          void logHighMatchFound({
            jobId,
            candidateId: row.candidate.id,
            userId,
            candidateFitScore: row.candidateFitScore,
          });
        }
      }
    }

    return NextResponse.json(filtered, {
      headers: {
        "X-Job-Id": jobId,
        "X-Candidate-Pool-Size": String(pool.length),
        "X-Candidate-Score-Result-Count": String(filtered.length),
        "X-Candidate-Score-Min-Score": String(minScore),
        "X-Candidate-Score-Min-Acceptable": String(thresholds.minimumAcceptableScore),
        "X-Candidate-Score-High-Priority": String(thresholds.highPriorityThreshold),
        "X-Candidate-Score-Auto-Shortlist": String(thresholds.autoShortlistThreshold),
        "X-Cache-Candidate-Scores": cache.results,
        "X-Cache-Semantic-Ranking": cache.semanticRanking,
        "X-Cache-Hybrid-Fit": cache.hybridFit,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Candidate scoring failed";
    console.error("[GET /api/jobs/[id]/candidate-scores]", e);
    return apiError(
      "CANDIDATE_SCORES_FAILED",
      process.env.NODE_ENV === "development" ? message : "Failed to load candidate scores",
      500
    );
  }
}
