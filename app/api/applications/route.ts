import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canCreateCandidate, canViewCandidates } from "@/src/lib/rbac";
import { isAdmin } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { validateApplicationText } from "@/src/lib/application-text-limits";
import { checkApplicationMutationRateLimit } from "@/src/lib/rate-limit";
import { isValidCuid } from "@/src/lib/validate-id";
import {
  buildApplicationCreatedDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import { dedupeApplicationsByCandidateIdentity } from "@/src/lib/candidate-identity";
import { prisma } from "@/src/lib/prisma";
import { computeResumeSha256HexFromResumeUrl } from "@/src/lib/resume-file-hash";
import { computeSkillMatchPercent } from "@/src/lib/resume-job-match";
import {
  notifyRecruitersApplicationCreated,
  scheduleNotificationWork,
} from "@/src/lib/notification-service";
import {
  invalidateCandidateScoringCaches,
  invalidateJobCandidateScoringCaches,
} from "@/src/lib/ai/candidate-scoring-cache";
import {
  invalidateCandidateRecommendedCandidatesCaches,
  invalidateJobRecommendedCandidatesCaches,
} from "@/src/lib/job-recommended-candidates-cache";
import { syncCrmSubmissionForApplication } from "@/src/lib/crm/crm-submission-sync";
import type { ApplicationStage, CandidateSource } from "@prisma/client";

const VALID_STAGES: ApplicationStage[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
  "REJECTED",
];

const VALID_SOURCES: CandidateSource[] = [
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

/** GET /api/applications — list applications with candidate and job. Optional filters: jobId, candidateId, stage, source (`Candidate.candidateSource`, e.g. LINKEDIN). Pagination: page (default 1), limit (default 20, max 100). */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim() || undefined;
  const candidateId = searchParams.get("candidateId")?.trim() || undefined;
  const stageParam = searchParams.get("stage")?.trim();
  const sourceParam = searchParams.get("source")?.trim();
  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");

  if (stageParam !== undefined && stageParam !== "") {
    const stage = (VALID_STAGES as string[]).includes(stageParam) ? (stageParam as ApplicationStage) : null;
    if (stage === null) {
      return apiError("INVALID_STAGE", "Invalid stage value", 400);
    }
  }

  if (sourceParam !== undefined && sourceParam !== "") {
    const source = (VALID_SOURCES as string[]).includes(sourceParam)
      ? (sourceParam as CandidateSource)
      : null;
    if (source === null) {
      return apiError("INVALID_SOURCE", "Invalid source value (use CandidateSource enum, e.g. LINKEDIN)", 400);
    }
  }

  if (jobId && !isValidCuid(jobId)) {
    return apiError("INVALID_ID", "Malformed ID format", 400);
  }
  if (candidateId && !isValidCuid(candidateId)) {
    return apiError("INVALID_ID", "Malformed ID format", 400);
  }

  const where: {
    jobId?: string;
    jobIdIn?: string[];
    candidateId?: string;
    stage?: ApplicationStage;
    candidate?: { candidateSource: CandidateSource };
    withdrawnAt: null;
  } = { withdrawnAt: null };
  const role = session.user?.role ?? "UNKNOWN";
  const userId = typeof session.user?.id === "string" ? session.user.id.trim() : "";

  // Role-scoped visibility:
  // ADMIN: all jobs
  // HIRING_MANAGER + RECRUITER: assigned jobs only
  let allowedJobIds: string[] | null = null;
  if (role === "RECRUITER" || role === "HIRING_MANAGER") {
    const links = await prisma.jobAssignment.findMany({
      where: { userId },
      select: { jobId: true },
      distinct: ["jobId"],
    });
    allowedJobIds = links.map((l) => l.jobId);
  }

  if (jobId) {
    if (allowedJobIds != null && !allowedJobIds.includes(jobId)) {
      return NextResponse.json({
        data: [],
        page: 1,
        limit: Math.min(MAX_LIMIT, Math.max(1, parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)),
        totalApplications: 0,
        totalPages: 0,
      });
    }
    where.jobId = jobId;
  } else if (allowedJobIds != null) {
    if (allowedJobIds.length === 0) {
      return NextResponse.json({
        data: [],
        page: 1,
        limit: Math.min(MAX_LIMIT, Math.max(1, parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)),
        totalApplications: 0,
        totalPages: 0,
      });
    }
    // Prisma typed where object doesn't include direct `in` in this local type; keep local marker then apply below.
    where.jobIdIn = allowedJobIds;
  }
  if (candidateId) where.candidateId = candidateId;
  if (stageParam !== undefined && stageParam !== "") {
    where.stage = stageParam as ApplicationStage;
  }
  if (sourceParam !== undefined && sourceParam !== "") {
    where.candidate = { candidateSource: sourceParam as CandidateSource };
  }

  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const prismaWhere: Parameters<typeof prisma.application.findMany>[0]["where"] = {
    withdrawnAt: null,
    ...(where.jobId ? { jobId: where.jobId } : {}),
    ...(where.jobIdIn ? { jobId: { in: where.jobIdIn } } : {}),
    ...(where.candidateId ? { candidateId: where.candidateId } : {}),
    ...(where.stage ? { stage: where.stage } : {}),
    ...(where.candidate ? { candidate: where.candidate } : {}),
  };

  const rawRows = await prisma.application.findMany({
      where: prismaWhere,
      orderBy: { appliedDate: "desc" },
      take: 500,
      select: {
        id: true,
        candidateId: true,
        jobId: true,
        stage: true,
        rating: true,
        rejectionReason: true,
        appliedDate: true,
        interviewDate: true,
        feedback: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        candidate: true,
        job: true,
      },
    });

  const deduped = dedupeApplicationsByCandidateIdentity(rawRows);
  const data = deduped.slice(offset, offset + limit);
  const totalApplications = deduped.length;

  const totalPages = totalApplications === 0 ? 0 : Math.ceil(totalApplications / limit);

  return NextResponse.json({
    data,
    page,
    limit,
    totalApplications,
    totalPages,
  });
}

/** POST /api/applications — create application linking candidate to job. ADMIN and RECRUITER only. Rate limited (50/min per user). 409 if duplicate. */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canCreateCandidate);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const rateLimitRes = checkApplicationMutationRateLimit(session.user?.id);
  if (rateLimitRes) return rateLimitRes;

  const body = await request.json().catch(() => ({}));
  const { candidateId, jobId, stage, source, rating, notes } = body as {
    candidateId?: string;
    jobId?: string;
    stage?: string;
    source?: string;
    rating?: number;
    notes?: string;
  };
  if (!candidateId || !jobId) {
    return apiError("VALIDATION_ERROR", "candidateId and jobId are required", 400);
  }
  if (!isValidCuid(candidateId)) {
    return apiError("INVALID_ID", "Malformed ID format", 400);
  }
  if (!isValidCuid(jobId)) {
    return apiError("INVALID_ID", "Malformed ID format", 400);
  }

  const [candidate, job] = await Promise.all([
    prisma.candidate.findUnique({ where: { id: candidateId } }),
    prisma.job.findUnique({ where: { id: jobId } }),
  ]);
  if (!candidate) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }
  if (!job) {
    return apiError("NOT_FOUND", "Job not found", 404);
  }
  if (!isAdmin(session.user?.role)) {
    const scoped = await prisma.jobAssignment.findUnique({
      where: { jobId_userId: { jobId, userId: session.user?.id ?? "" } },
      select: { id: true },
    });
    if (!scoped) {
      return apiError("FORBIDDEN", "You can only create applications for assigned jobs", 403);
    }
  }

  if (job.status !== "OPEN") {
    return apiError("FORBIDDEN", "Applications are only allowed for open jobs", 403);
  }

  // Resume eligibility gate (non-LLM): candidate can apply only if resume parse for the current resume is COMPLETED
  // and parse output was applied to CandidateSkill, then skill match >= threshold (jobMeta.resumeMatchThreshold).
  const jobMetaObj =
    job.jobMeta != null && typeof job.jobMeta === "object" && !Array.isArray(job.jobMeta)
      ? (job.jobMeta as Record<string, unknown>)
      : null;
  const thresholdRaw = jobMetaObj?.resumeMatchThreshold;
  const threshold =
    thresholdRaw === null || thresholdRaw === undefined || thresholdRaw === ""
      ? null
      : Number(thresholdRaw);
  const requiredSkillsRaw = jobMetaObj?.requiredSkills;
  const requiredSkills = Array.isArray(requiredSkillsRaw)
    ? requiredSkillsRaw.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];

  if (threshold != null && Number.isFinite(threshold) && threshold > 0 && requiredSkills.length > 0) {
    const resumeUrl = typeof candidate.resumeUrl === "string" ? candidate.resumeUrl.trim() : "";
    if (!resumeUrl) {
      return apiError("NOT_ELIGIBLE", "Not eligible for this role (resume not uploaded).", 403, {
        reason: "NO_RESUME",
        requiredThreshold: threshold,
      });
    }

    const hashed = await computeResumeSha256HexFromResumeUrl(resumeUrl);
    if (hashed.ok === false) {
      const reason = hashed.reason === "INVALID_URL" ? "INVALID_RESUME_REFERENCE" : "RESUME_FILE_MISSING";
      return apiError("NOT_ELIGIBLE", "Not eligible for this role (resume must be re-uploaded).", 403, {
        reason,
        requiredThreshold: threshold,
      });
    }

    const done = await prisma.resumeParseJob.findFirst({
      where: { candidateId, fileHash: hashed.hash, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!done) {
      return apiError("NOT_ELIGIBLE", "Not eligible for this role (resume parse not completed).", 403, {
        reason: "PARSE_NOT_DONE",
        requiredThreshold: threshold,
      });
    }

    const skills = await prisma.candidateSkill.findMany({
      where: { candidateId },
      select: { skillName: true },
      take: 500,
    });
    const candidateSkills = skills.map((s) => s.skillName);
    if (candidateSkills.length === 0) {
      return apiError("NOT_ELIGIBLE", "Not eligible for this role (resume parse not applied to candidate skills).", 403, {
        reason: "PARSE_NOT_APPLIED",
        requiredThreshold: threshold,
      });
    }

    const match = computeSkillMatchPercent({ requiredSkills, candidateSkills });
    if (match.percent < threshold) {
      return apiError("NOT_ELIGIBLE", "Not eligible for this role.", 403, {
        requiredThreshold: threshold,
        matchPercent: match.percent,
        requiredSkillsCount: match.required,
        matchedSkillsCount: match.matched,
      });
    }
  }

  const notesValue = notes != null ? (typeof notes === "string" ? notes.trim() || null : null) : null;
  if (notesValue != null) {
    const notesError = validateApplicationText("notes", notesValue);
    if (notesError) {
      return apiError(notesError.code, notesError.message, 400);
    }
  }

  const createdDetailsSerialized = serializeActivityLogDetails(
    buildApplicationCreatedDetails(jobId)
  );
  if (createdDetailsSerialized.ok === false) {
    return apiError(
      createdDetailsSerialized.code,
      createdDetailsSerialized.message,
      400
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: {
          candidateId,
          jobId,
          stage: (stage ?? "APPLIED") as ApplicationStage,
          source: source ?? null,
          rating: rating ?? null,
          notes: notes ?? null,
        },
        include: {
          candidate: true,
          job: true,
        },
      });

      const userId = session.user?.id;
      if (typeof userId === "string") {
        await tx.activityLog.create({
          data: {
            applicationId: application.id,
            userId,
            action: "APPLICATION_CREATED",
            details: createdDetailsSerialized.json,
          },
        });
      }

      return application;
    }, { maxWait: 10_000, timeout: 20_000 });

    scheduleNotificationWork(
      notifyRecruitersApplicationCreated({
        applicationId: created.id,
        candidateName: created.candidate.candidateName,
        jobTitle: created.job.title,
        jobId: created.jobId,
        actorUserId: typeof session.user?.id === "string" ? session.user.id : undefined,
      })
    );

    void invalidateJobRecommendedCandidatesCaches(created.jobId);
    void invalidateJobCandidateScoringCaches(created.jobId);
    void invalidateCandidateRecommendedCandidatesCaches(created.candidateId);
    void invalidateCandidateScoringCaches(created.candidateId);

    void syncCrmSubmissionForApplication(created.id, created.jobId).catch((e) => {
      console.error("[POST /api/applications] CRM submission sync failed:", e);
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return apiError("CONFLICT", "Candidate has already applied to this job", 409);
    }
    throw e;
  }
}
