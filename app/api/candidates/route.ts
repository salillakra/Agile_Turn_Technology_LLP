import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canCreateCandidate, canViewCandidates } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import {
  notifyRecruitersCandidateAdded,
  scheduleNotificationWork,
} from "@/src/lib/notification-service";
import type { CandidateSource } from "@prisma/client";

const CANDIDATE_SOURCES: CandidateSource[] = [
  "LINKEDIN",
  "INDEED",
  "REFERRAL",
  "COMPANY_WEBSITE",
  "GLASSDOOR",
  "HEADHUNTER",
  "OTHER",
];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/candidates — paginated list. Query: ?page=1&limit=20&search=react. */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { searchParams } = new URL(request.url);
  const searchRaw = searchParams.get("search");
  const searchTerm = typeof searchRaw === "string" ? searchRaw.trim() : "";
  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");

  const page = Math.max(1, parseInt(String(pageRaw), 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(String(limitRaw), 10) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;

  const scopeWhere = buildCandidateVisibilityWhere(role, userId);
  const searchWhere =
    searchTerm.length > 0
      ? {
          OR: [
            { candidateName: { contains: searchTerm, mode: "insensitive" as const } },
            { email: { contains: searchTerm, mode: "insensitive" as const } },
            { currentCompany: { contains: searchTerm, mode: "insensitive" as const } },
            { currentDesignation: { contains: searchTerm, mode: "insensitive" as const } },
            {
              candidateSkills: {
                some: { skillName: { contains: searchTerm, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : undefined;
  const where = {
    ...scopeWhere,
    ...(searchWhere ?? {}),
  };

  const [totalCandidates, candidates] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        candidateName: true,
        email: true,
        contactNumber: true,
        currentCompany: true,
        currentDesignation: true,
        totalExperience: true,
        candidateSource: true,
        rating: true,
        candidateSkills: { select: { skillName: true } },
        _count: {
          select: { applications: true, notes: true, candidateNotes: true },
        },
      },
    }),
  ]);

  const data = candidates.map((c) => ({
    id: c.id,
    candidateName: c.candidateName,
    email: c.email,
    contactNumber: c.contactNumber,
    currentCompany: c.currentCompany,
    currentDesignation: c.currentDesignation,
    totalExperience: c.totalExperience,
    candidateSource: c.candidateSource,
    rating: c.rating,
    skills: c.candidateSkills.map((s) => s.skillName),
    notesCount: c._count.notes + c._count.candidateNotes,
    applicationCount: c._count.applications,
  }));

  const totalPages = totalCandidates === 0 ? 0 : Math.ceil(totalCandidates / limit);

  return NextResponse.json({
    data,
    page,
    limit,
    totalCandidates,
    totalPages,
  });
}

/** POST /api/candidates — create candidate. ADMIN and RECRUITER only; 403 for others. */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canCreateCandidate);
  if (auth instanceof NextResponse) return auth;
  const actorUserId = auth.session.user?.id;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const candidateName = typeof body.candidateName === "string" ? body.candidateName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const contactNumber =
    body.contactNumber != null ? String(body.contactNumber).trim() : null;

  if (!candidateName) {
    return NextResponse.json(
      { error: "candidateName is required" },
      { status: 400 }
    );
  }
  if (!email) {
    return NextResponse.json(
      { error: "email is required" },
      { status: 400 }
    );
  }
  if (body.contactNumber === undefined || body.contactNumber === null) {
    return NextResponse.json(
      { error: "contactNumber is required" },
      { status: 400 }
    );
  }

  const sourceRaw = body.candidateSource;
  const candidateSource: CandidateSource | undefined =
    typeof sourceRaw === "string" && CANDIDATE_SOURCES.includes(sourceRaw as CandidateSource)
      ? (sourceRaw as CandidateSource)
      : undefined;

  const totalExperience =
    body.totalExperience != null ? Number(body.totalExperience) : undefined;
  const relevantExperience =
    body.relevantExperience != null ? Number(body.relevantExperience) : undefined;

  const candidate = await prisma.candidate.create({
    data: {
      candidateName,
      email: email.toLowerCase(),
      contactNumber: contactNumber === "" ? null : contactNumber,
      candidateSource,
      totalExperience: Number.isInteger(totalExperience) ? totalExperience : undefined,
      relevantExperience: Number.isInteger(relevantExperience) ? relevantExperience : undefined,
    },
  });

  scheduleNotificationWork(
    notifyRecruitersCandidateAdded({
      candidateId: candidate.id,
      candidateName: candidate.candidateName,
      actorUserId: typeof actorUserId === "string" ? actorUserId : undefined,
    })
  );

  return NextResponse.json(candidate, { status: 201 });
}
