import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import {
  dedupeCandidateRecommendationsByIdentity,
  HYBRID_RECOMMENDATION_WEIGHTS,
  recommendAndFilterCandidatesForJob,
  type CandidateRecommendationPoolItem,
  type CandidateRecommendationRow,
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
 * GET /api/jobs/[id]/candidate-recommendations
 *
 * Hybrid candidate recommendations for a job (ranked by `finalScore` DESC).
 *
 * **Formula:** 50% semantic + 30% skill + 15% experience + 5% location.
 *
 * **Response** (`CandidateRecommendationRow[]` per candidate):
 * - `finalScore` — weighted blend (0–100)
 * - `semanticScore` — cosine similarity on stored embeddings (0–100)
 * - `skillScore` — required/preferred skill overlap (0–100)
 * - `experienceScore` — years fit vs job minimum (0–100)
 * - `matchedSkills`, `missingSkills`, `experienceGapYears`, `meetsExperienceMinimum`
 * - `recommendationReason` — recruiter-facing explainability (semantic, skills, experience)
 *
 * Uses stored embeddings only on this request; schedules background embed refresh (non-blocking).
 *
 * Query: `minScore` (default 45), `excludeApplied` (default true). Below-threshold candidates omitted.
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

    const { searchParams } = new URL(request.url);
    const minScoreQuery = searchParams.get("minScore");
    const excludeApplied =
      searchParams.get("excludeApplied") !== "false" &&
      searchParams.get("excludeApplied") !== "0";

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

    const candidateWhere = isAdmin(role)
      ? {}
      : {
          OR: [
            buildCandidateVisibilityWhere(role, userId),
            { applications: { none: {} } },
          ],
        };

    const candidates = await prisma.candidate.findMany({
      where: candidateWhere,
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
      if (await isCandidateExcludedFromJobRecommendations(item, jobId)) {
        continue;
      }
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

    const ranked = dedupeCandidateRecommendationsByIdentity(
      recommendAndFilterCandidatesForJob(
        jobInput,
        job.embedding,
        pool,
        minScore
      ),
      pool
    );

    scheduleEmbeddingsForJobCandidateRecommendations({
      jobId,
      jobEmbedding: job.embedding,
      candidateIds: pool.map((p) => p.id),
      candidateEmbeddings: new Map(pool.map((p) => [p.id, p.embedding ?? null])),
    });

    const body: CandidateRecommendationRow[] = ranked;

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
        "X-Recommendation-Mode": "hybrid-reverse",
        "X-Recommendation-Weights": `semantic=${w.semantic},skill=${w.skill},experience=${w.experience},location=${w.location}`,
        "X-Recommendation-Min-Score": String(minScore),
        "X-Recommendation-Default-Min-Score": String(
          getDefaultCandidateRecommendationMinScorePercent()
        ),
        "X-Recommendation-Embeddings": "stored-only",
        "X-Job-Embedding-Present": job.embedding != null ? "true" : "false",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Candidate recommendations failed";
    console.error("[GET /api/jobs/[id]/candidate-recommendations]", e);
    return apiError(
      "RECOMMENDATIONS_FAILED",
      process.env.NODE_ENV === "development" ? message : "Failed to load candidate recommendations",
      500
    );
  }
}
