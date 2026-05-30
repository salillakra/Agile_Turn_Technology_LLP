import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import {
  HYBRID_RECOMMENDATION_WEIGHTS,
  recommendCandidatesForJobApi,
  type CandidateRecommendationPoolItem,
  type RecommendedCandidateApiRow,
} from "@/src/lib/candidate-recommendation-engine";
import { isCandidateExcludedFromJobRecommendations } from "@/src/lib/candidate-identity";
import { scheduleEmbeddingsForJobCandidateRecommendations } from "@/src/lib/recommendation-embedding-prep";
import {
  getDefaultCandidateRecommendationMinScorePercent,
  readJobResumeMatchThresholdPercent,
  resolveCandidateRecommendationMinScoreForJob,
} from "@/src/lib/recommendation-config";
import { canViewCandidates, isAdmin } from "@/src/lib/rbac";
import {
  buildCandidateVisibilityWhere,
  canAccessJobByScope,
} from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import { logCandidatesRecommended } from "@/src/lib/candidate-recommendation-activity-log";
import { normalizeSkills } from "@/src/lib/skill-normalizer";
import { isValidCuid } from "@/src/lib/validate-id";
import {
  buildJobRecommendedCandidatesScopeKey,
  getCachedJobRecommendedCandidates,
  recommendationJobFingerprint,
  setCachedJobRecommendedCandidates,
} from "@/src/lib/job-recommended-candidates-cache";
import { swrRevalidateOnce } from "@/src/lib/cache/swr-cache";
import { buildCacheKey } from "@/src/lib/cache/cache-keys";

type RouteContext = { params: Promise<{ id: string }> };

function toPoolItem(
  row: {
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
    positionRole: string | null;
    candidateSkills: { skillName: string }[];
  }
): CandidateRecommendationPoolItem {
  const rawSkills =
    row.skills.length > 0
      ? row.skills
      : row.candidateSkills.map((s) => s.skillName).filter(Boolean);

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
    positionRole: row.positionRole,
  };
}

/**
 * GET /api/jobs/[id]/recommended-candidates
 *
 * 1. Load job by id (RBAC).
 * 2. Load **active** candidates: talent-pool profiles visible to the user who do not
 *    already have a non-withdrawn application on this job.
 * 3. Deduplicate pool by email; sync missing embeddings (best-effort); run hybrid engine.
 * 4. Return ranked candidates above the quality threshold.
 *
 * **Response:** `RecommendedCandidateApiRow[]`
 * - `candidateId`, `candidateName`, `finalScore`, `semanticScore`, `matchedSkills`, `recommendationReason`
 *
 * Query: `minScore` (default 45) — candidates below threshold are omitted.
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

  try {
    if (!(await canAccessJobByScope(role, userId, jobId))) {
      return apiError("FORBIDDEN", "You do not have access to this job", 403);
    }

    const minScoreQuery = new URL(request.url).searchParams.get("minScore");

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
        status: true,
      },
    });

    if (!job) {
      return apiError("NOT_FOUND", "Job not found", 404);
    }

    const minScore = resolveCandidateRecommendationMinScoreForJob(
      minScoreQuery,
      readJobResumeMatchThresholdPercent(job.jobMeta)
    );

    const scopeKey = buildJobRecommendedCandidatesScopeKey(role, userId);
    const jobFingerprint = recommendationJobFingerprint({
      jobId: job.id,
      title: job.title,
      location: job.location,
      yearsOfExperience: job.yearsOfExperience,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      jobMeta: job.jobMeta,
      embedding: job.embedding,
      embeddingUpdatedAt: job.embeddingUpdatedAt,
    });

    const cachedEarly = await getCachedJobRecommendedCandidates({
      jobId,
      scopeKey,
      minScore,
      jobFingerprint,
    });

    if (cachedEarly.payload) {
      // SWR: return cached immediately; refresh asynchronously in-process.
      const lockKey = buildCacheKey(
        "rec",
        "lock",
        "job",
        jobId,
        scopeKey,
        String(minScore)
      );
      void swrRevalidateOnce(lockKey, 30, async () => {
        // Recompute with latest pool; best-effort (errors are swallowed).
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
            skills: true,
            normalizedSkills: true,
            totalExperience: true,
            relevantExperience: true,
            preferredWorkLocation: true,
            currentDesignation: true,
            positionRole: true,
            candidateSkills: { select: { skillName: true }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { updatedAt: "desc" },
        });

        const pool: CandidateRecommendationPoolItem[] = [];
        for (const row of candidates) {
          const item = toPoolItem(row);
          if (await isCandidateExcludedFromJobRecommendations(item, jobId)) continue;
          pool.push(item);
        }

        const jobInput = {
          id: job.id,
          title: job.title,
          location: job.location,
          yearsOfExperience: job.yearsOfExperience,
          requiredSkills: job.requiredSkills,
          preferredSkills: job.preferredSkills,
          jobMeta: job.jobMeta,
          embedding: job.embedding,
        };

        const rows: RecommendedCandidateApiRow[] = recommendCandidatesForJobApi(
          jobInput,
          job.embedding,
          pool,
          minScore
        );

        await setCachedJobRecommendedCandidates({
          jobId,
          scopeKey,
          minScore,
          jobFingerprint,
          poolCandidateIds: pool.map((p) => p.id),
          payload: {
            rows,
            meta: {
              minScore,
              poolSize: candidates.length,
              resultCount: rows.length,
              jobEmbeddingPresent: job.embedding != null,
            },
            cachedAt: new Date().toISOString(),
          },
        });
      });

      const w = HYBRID_RECOMMENDATION_WEIGHTS;
      const body = cachedEarly.payload.rows;
      return NextResponse.json(body, {
        headers: {
          "X-Cache-Job-Recommendations": "hit",
          "X-Recommendation-Mode": "hybrid-reverse",
          "X-Recommendation-Weights": `semantic=${w.semantic},skill=${w.skill},experience=${w.experience},location=${w.location}`,
          "X-Recommendation-Min-Score": String(minScore),
          "X-Recommendation-Default-Min-Score": String(
            getDefaultCandidateRecommendationMinScorePercent()
          ),
          "X-Recommendation-Embeddings": "stored-or-queued",
          "X-Recommendation-Embedding-Synced": "skipped",
          "X-Job-Embedding-Present": cachedEarly.payload.meta.jobEmbeddingPresent
            ? "true"
            : "false",
          "X-Active-Candidate-Pool-Size": String(cachedEarly.payload.meta.poolSize),
          "X-Recommendation-Result-Count": String(body.length),
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
        skills: true,
        normalizedSkills: true,
        totalExperience: true,
        relevantExperience: true,
        preferredWorkLocation: true,
        currentDesignation: true,
        positionRole: true,
        candidateSkills: { select: { skillName: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const jobInput = {
      id: job.id,
      title: job.title,
      location: job.location,
      yearsOfExperience: job.yearsOfExperience,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      jobMeta: job.jobMeta,
      embedding: job.embedding,
    };

    const pool: CandidateRecommendationPoolItem[] = [];
    for (const row of candidates) {
      const item = toPoolItem(row);
      if (await isCandidateExcludedFromJobRecommendations(item, jobId)) {
        continue;
      }
      pool.push(item);
    }

    const body: RecommendedCandidateApiRow[] = recommendCandidatesForJobApi(
      jobInput,
      job.embedding,
      pool,
      minScore
    );

    void setCachedJobRecommendedCandidates({
      jobId,
      scopeKey,
      minScore,
      jobFingerprint,
      poolCandidateIds: pool.map((p) => p.id),
      payload: {
        rows: body,
        meta: {
          minScore,
          poolSize: candidates.length,
          resultCount: body.length,
          jobEmbeddingPresent: job.embedding != null,
        },
        cachedAt: new Date().toISOString(),
      },
    });

    scheduleEmbeddingsForJobCandidateRecommendations({
      jobId,
      jobEmbedding: job.embedding,
      candidateIds: pool.map((p) => p.id),
      candidateEmbeddings: new Map(pool.map((p) => [p.id, p.embedding ?? null])),
    });

    try {
      await logCandidatesRecommended({
        jobId,
        userId,
        candidates: body.map((row) => ({
          candidateId: row.candidateId,
          recommendationScore: row.finalScore,
        })),
      });
    } catch {
      // Recommendation response must not fail if audit write fails.
    }

    const w = HYBRID_RECOMMENDATION_WEIGHTS;

    return NextResponse.json(body, {
      headers: {
        "X-Cache-Job-Recommendations": "miss",
        "X-Recommendation-Mode": "hybrid-reverse",
        "X-Recommendation-Weights": `semantic=${w.semantic},skill=${w.skill},experience=${w.experience},location=${w.location}`,
        "X-Recommendation-Min-Score": String(minScore),
        "X-Recommendation-Default-Min-Score": String(
          getDefaultCandidateRecommendationMinScorePercent()
        ),
        "X-Recommendation-Embeddings": "stored-or-queued",
        "X-Recommendation-Embedding-Synced": "queue",
        "X-Job-Embedding-Present": job.embedding != null ? "true" : "false",
        "X-Active-Candidate-Pool-Size": String(candidates.length),
        "X-Recommendation-Result-Count": String(body.length),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Recommended candidates failed";
    console.error("[GET /api/jobs/[id]/recommended-candidates]", e);
    return apiError(
      "RECOMMENDATIONS_FAILED",
      process.env.NODE_ENV === "development" ? message : "Failed to load recommended candidates",
      500
    );
  }
}
