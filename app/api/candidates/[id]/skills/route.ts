import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { enqueueCandidateEmbedding } from "@/src/lib/enqueue-entity-embedding";
import { invalidateCandidateScoringCaches } from "@/src/lib/ai/candidate-scoring-cache";
import { invalidateCandidateRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";
import { prisma } from "@/src/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/candidates/[id]/skills — add a skill to a candidate. ADMIN and RECRUITER. Prevents duplicate skill names. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id: candidateId } = await context.params;
  if (!candidateId) return NextResponse.json({ error: "Missing candidate id" }, { status: 400 });

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, ...buildCandidateVisibilityWhere(role, userId) },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const skillName = typeof body.skillName === "string" ? body.skillName.trim() : "";
  if (!skillName) {
    return NextResponse.json({ error: "skillName is required" }, { status: 400 });
  }
  if (skillName.length > 200) {
    return NextResponse.json({ error: "skillName must be at most 200 characters" }, { status: 400 });
  }

  const existing = await prisma.candidateSkill.findFirst({
    where: {
      candidateId,
      skillName: { equals: skillName, mode: "insensitive" },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Candidate already has this skill" },
      { status: 409 }
    );
  }

  const skill = await prisma.candidateSkill.create({
    data: { candidateId, skillName },
  });
  void invalidateCandidateRecommendedCandidatesCaches(candidateId);
  void invalidateCandidateScoringCaches(candidateId);
  void enqueueCandidateEmbedding(candidateId).catch((e) => {
    console.error("[POST /api/candidates/[id]/skills] embedding enqueue failed:", e);
  });
  return NextResponse.json(skill, { status: 201 });
}
