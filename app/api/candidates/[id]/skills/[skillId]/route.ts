import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { enqueueCandidateEmbedding } from "@/src/lib/enqueue-entity-embedding";
import { invalidateCandidateScoringCaches } from "@/src/lib/ai/candidate-scoring-cache";
import { invalidateCandidateRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";
import { prisma } from "@/src/lib/prisma";

type RouteContext = { params: Promise<{ id: string; skillId: string }> };

/** DELETE /api/candidates/[id]/skills/[skillId] — remove a skill from a candidate. ADMIN and RECRUITER. */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id: candidateId, skillId } = await context.params;
  if (!candidateId) return NextResponse.json({ error: "Missing candidate id" }, { status: 400 });
  if (!skillId) return NextResponse.json({ error: "Missing skill id" }, { status: 400 });

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, ...buildCandidateVisibilityWhere(role, userId) },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const skill = await prisma.candidateSkill.findFirst({
    where: { id: skillId, candidateId },
  });
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  await prisma.candidateSkill.delete({ where: { id: skillId } });
  void invalidateCandidateRecommendedCandidatesCaches(candidateId);
  void invalidateCandidateScoringCaches(candidateId);
  void enqueueCandidateEmbedding(candidateId).catch((e) => {
    console.error("[DELETE /api/candidates/[id]/skills/[skillId]] embedding enqueue failed:", e);
  });
  return new NextResponse(null, { status: 204 });
}
