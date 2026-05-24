import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate, canViewCandidates } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

const authorSelect = { id: true, name: true, email: true };

/** GET /api/candidates/[id]/notes — list recruiter notes for a candidate (note text, recruiter id, timestamp). */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
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

  const notes = await prisma.candidateNote.findMany({
    where: { candidateId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: authorSelect } },
  });

  const data = notes.map((n) => ({
    id: n.id,
    note: n.note,
    createdBy: n.createdBy,
    createdAt: n.createdAt,
    author: n.author,
  }));

  return NextResponse.json(data);
}

/** POST /api/candidates/[id]/notes — add a recruiter note. ADMIN and RECRUITER. Stores note text, recruiter user id, timestamp. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const actorUserId = typeof session.user?.id === "string" ? session.user.id : undefined;

  const { id: candidateId } = await context.params;
  if (!candidateId) return NextResponse.json({ error: "Missing candidate id" }, { status: 400 });

  const userId = session.user?.id;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, ...buildCandidateVisibilityWhere(role, actorUserId) },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  const created = await prisma.candidateNote.create({
    data: { candidateId, note, createdBy: userId },
    include: { author: { select: authorSelect } },
  });

  return NextResponse.json(
    {
      id: created.id,
      note: created.note,
      createdBy: created.createdBy,
      createdAt: created.createdAt,
      author: created.author,
    },
    { status: 201 }
  );
}
