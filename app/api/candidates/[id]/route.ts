import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canDeleteCandidate, canEditCandidate, canViewCandidates } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import type { CandidateSource } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  candidateDetailInclude,
  formatCandidateDetail,
} from "@/src/lib/candidate-detail-response";
import { candidatePatchAffectsEmbedding } from "@/src/lib/candidate-semantic-text";
import { enqueueCandidateEmbedding } from "@/src/lib/enqueue-entity-embedding";
import { invalidateCandidateScoringCaches } from "@/src/lib/ai/candidate-scoring-cache";
import { invalidateCandidateRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";

type RouteContext = { params: Promise<{ id: string }> };

const CANDIDATE_SOURCES: CandidateSource[] = [
  "LINKEDIN",
  "INDEED",
  "REFERRAL",
  "COMPANY_WEBSITE",
  "GLASSDOOR",
  "HEADHUNTER",
  "OTHER",
];

/** GET /api/candidates/[id] — full candidate profile with skills, notes, applications. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: candidateDetailInclude,
  });

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const visible = await prisma.candidate.findFirst({
    where: { id, ...buildCandidateVisibilityWhere(role, userId) },
    select: { id: true },
  });
  if (!visible) {
    return apiError("FORBIDDEN", "You do not have access to this candidate", 403);
  }

  return NextResponse.json(formatCandidateDetail(candidate));
}

/** PUT /api/candidates/[id] — update candidate. ADMIN and RECRUITER only. */
export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.candidate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const visible = await prisma.candidate.findFirst({
    where: { id, ...buildCandidateVisibilityWhere(role, userId) },
    select: { id: true },
  });
  if (!visible) {
    return apiError("FORBIDDEN", "You do not have access to this candidate", 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: {
    candidateName?: string;
    email?: string;
    contactNumber?: string | null;
    candidateSource?: CandidateSource;
    totalExperience?: number | null;
    currentDesignation?: string | null;
    currentCompany?: string | null;
    expectedCTC?: number | string | null;
    preferredWorkLocation?: string | null;
  } = {};

  if (body.candidateName !== undefined) {
    const v = typeof body.candidateName === "string" ? body.candidateName.trim() : "";
    if (!v) return NextResponse.json({ error: "candidateName cannot be empty" }, { status: 400 });
    data.candidateName = v;
  }
  if (body.email !== undefined) {
    const v = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!v) return NextResponse.json({ error: "email cannot be empty" }, { status: 400 });
    data.email = v;
  }
  if (body.contactNumber !== undefined) {
    const v =
      body.contactNumber == null ? null : String(body.contactNumber).trim() || null;
    data.contactNumber = v;
  }
  if (body.candidateSource !== undefined) {
    const sourceRaw = body.candidateSource;
    if (
      typeof sourceRaw !== "string" ||
      !CANDIDATE_SOURCES.includes(sourceRaw as CandidateSource)
    ) {
      return NextResponse.json({ error: "Invalid candidateSource" }, { status: 400 });
    }
    data.candidateSource = sourceRaw as CandidateSource;
  }
  if (body.experience !== undefined || body.totalExperience !== undefined) {
    const v = body.totalExperience !== undefined ? body.totalExperience : body.experience;
    if (v === null) {
      data.totalExperience = null;
    } else {
      const n = Number(v);
      if (!Number.isInteger(n)) {
        return NextResponse.json({ error: "experience must be an integer or null" }, { status: 400 });
      }
      data.totalExperience = n;
    }
  }
  if (body.designation !== undefined) {
    data.currentDesignation =
      typeof body.designation === "string" ? body.designation.trim() || null : null;
  }
  if (body.company !== undefined) {
    data.currentCompany =
      typeof body.company === "string" ? body.company.trim() || null : null;
  }
  if (body.expectedCTC !== undefined) {
    const v = body.expectedCTC;
    data.expectedCTC = v === null ? null : Number(v);
  }
  if (body.preferredWorkLocation !== undefined) {
    data.preferredWorkLocation =
      typeof body.preferredWorkLocation === "string"
        ? body.preferredWorkLocation.trim() || null
        : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(existing);
  }

  let updated;
  try {
    updated = await prisma.candidate.update({
      where: { id },
      data,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Another candidate already uses this email" },
        { status: 409 }
      );
    }
    throw e;
  }

  void invalidateCandidateRecommendedCandidatesCaches(updated.id);
  void invalidateCandidateScoringCaches(updated.id);

  if (candidatePatchAffectsEmbedding(body)) {
    void enqueueCandidateEmbedding(id).catch((e) => {
      console.error("[PATCH /api/candidates/[id]] embedding enqueue failed:", e);
    });
  }

  return NextResponse.json(updated);
}

/** DELETE /api/candidates/[id] — delete candidate. ADMIN only. 409 if candidate has applications. */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canDeleteCandidate);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const visible = await prisma.candidate.findFirst({
    where: { id, ...buildCandidateVisibilityWhere(role, userId) },
    select: { id: true },
  });
  if (!visible) {
    return apiError("FORBIDDEN", "You do not have access to this candidate", 403);
  }
  if (candidate._count.applications > 0) {
    return NextResponse.json(
      { error: "Cannot delete candidate with associated applications" },
      { status: 409 }
    );
  }

  await prisma.candidate.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
