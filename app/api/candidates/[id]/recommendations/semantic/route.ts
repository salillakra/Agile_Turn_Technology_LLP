import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canViewCandidates } from "@/src/lib/rbac";
import {
  buildJobVisibilityWhere,
  canAccessCandidateForRecommendations,
} from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import {
  rankJobsBySemanticSimilarity,
  type SemanticJobRecommendation,
} from "@/src/lib/semantic-recommendation";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/candidates/[id]/recommendations/semantic
 *
 * Rank open jobs by cosine similarity between stored candidate and job embeddings.
 * Jobs without embeddings are skipped. Returns [] when the candidate has no embedding.
 */
export async function GET(_request: Request, context: RouteContext) {
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

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, embedding: true },
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
        embedding: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const body: SemanticJobRecommendation[] = rankJobsBySemanticSimilarity(
      candidate.embedding,
      jobs.map((job) => ({
        jobId: job.id,
        title: job.title,
        embedding: job.embedding,
      }))
    );

    return NextResponse.json(body, {
      headers: {
        "X-Recommendation-Mode": "semantic",
        "X-Candidate-Has-Embedding": candidate.embedding != null ? "true" : "false",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Semantic recommendations failed";
    console.error("[GET /api/candidates/[id]/recommendations/semantic]", e);
    return apiError(
      "RECOMMENDATIONS_FAILED",
      process.env.NODE_ENV === "development" ? message : "Failed to load semantic recommendations",
      500
    );
  }
}
