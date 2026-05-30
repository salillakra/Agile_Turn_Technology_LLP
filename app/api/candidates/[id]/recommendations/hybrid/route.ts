import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import {
  filterHybridRecommendationsByThreshold,
  recommendJobsHybrid,
  type HybridJobRecommendation,
} from "@/src/lib/hybrid-recommendation";
import {
  getDefaultMinMatchScorePercent,
  resolveMinMatchScorePercent,
} from "@/src/lib/recommendation-config";
import { canViewCandidates } from "@/src/lib/rbac";
import {
  buildJobVisibilityWhere,
  canAccessCandidateForRecommendations,
} from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import { normalizeSkills } from "@/src/lib/skill-normalizer";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string }> };

function toRecommendationCandidate(
  row: {
    skills: string[];
    normalizedSkills: string[];
    totalExperience: number | null;
    relevantExperience: number | null;
    preferredWorkLocation: string | null;
    currentDesignation: string | null;
    positionRole: string | null;
    candidateSkills: { skillName: string }[];
  },
  id: string
) {
  const rawSkills =
    row.skills.length > 0
      ? row.skills
      : row.candidateSkills.map((s) => s.skillName).filter(Boolean);

  const normalizedSkills =
    row.normalizedSkills.length > 0 ? row.normalizedSkills : normalizeSkills(rawSkills);

  return {
    id,
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
 * GET /api/candidates/[id]/recommendations/hybrid
 *
 * Hybrid ranking: 50% semantic + 30% skill + 15% experience + 5% location.
 * Query: `minScore` filters on `finalScore` (default from recommendation config, typically 40).
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  const candidateId = typeof id === "string" ? id.trim() : "";
  if (!candidateId || !isValidCuid(candidateId)) {
    return apiError("INVALID_ID", "Malformed candidate id", 400);
  }

  try {
    const allowed = await canAccessCandidateForRecommendations(role, userId, candidateId);
    if (!allowed) {
      return apiError("FORBIDDEN", "You do not have access to this candidate", 403);
    }

    const minScore = resolveMinMatchScorePercent(
      new URL(request.url).searchParams.get("minScore")
    );

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
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
    });

    if (!candidate) {
      return apiError("NOT_FOUND", "Candidate not found", 404);
    }

    const jobs = await prisma.job.findMany({
      where: {
        status: "OPEN",
        ...buildJobVisibilityWhere(role, userId),
      },
      select: {
        id: true,
        title: true,
        location: true,
        yearsOfExperience: true,
        requiredSkills: true,
        preferredSkills: true,
        jobMeta: true,
        embedding: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const candidateInput = toRecommendationCandidate(candidate, candidateId);
    const ranked = recommendJobsHybrid(
      candidateInput,
      candidate.embedding,
      jobs.map((job) => ({
        id: job.id,
        title: job.title,
        location: job.location,
        yearsOfExperience: job.yearsOfExperience,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        jobMeta: job.jobMeta,
        embedding: job.embedding,
      }))
    );

    const body: HybridJobRecommendation[] = filterHybridRecommendationsByThreshold(
      ranked,
      minScore
    );

    return NextResponse.json(body, {
      headers: {
        "X-Recommendation-Mode": "hybrid",
        "X-Recommendation-Min-Score": String(minScore),
        "X-Recommendation-Default-Min-Score": String(getDefaultMinMatchScorePercent()),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Hybrid recommendations failed";
    console.error("[GET /api/candidates/[id]/recommendations/hybrid]", e);
    return apiError(
      "RECOMMENDATIONS_FAILED",
      process.env.NODE_ENV === "development" ? message : "Failed to load hybrid recommendations",
      500
    );
  }
}
