import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";
import { isResumeParseResult } from "@/src/lib/resume-parse-result";
import {
  buildResumeParseAppliedToCandidateDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import {
  candidateDetailInclude,
  formatCandidateDetail,
} from "@/src/lib/candidate-detail-response";
import { ACTIVITY_ACTION_RESUME_PARSE_APPLIED_TO_CANDIDATE } from "@/src/lib/resume-parse-activity-log";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/candidates/[id]/resume/parse/apply
 *
 * Persists recruiter-reviewed parse output onto `Candidate` (name, experience years, skills).
 * Body: `{ resumeParseJobId, result }` where `result` matches `ResumeParseResult`.
 * The job must be `DONE` for this candidate.
 *
 * **RBAC:** `canEditCandidate` — ADMIN and RECRUITER only.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const userId = typeof session.user?.id === "string" ? session.user.id : null;
  if (!userId) {
    return apiError("UNAUTHORIZED", "Session user id missing", 401);
  }

  const { id: candidateId } = await context.params;
  if (!candidateId?.trim()) {
    return apiError("VALIDATION_ERROR", "Missing candidate id", 400);
  }
  if (!isValidCuid(candidateId)) {
    return apiError("INVALID_ID", "Malformed candidate id", 400);
  }
  if (
    !(await prisma.candidate.findFirst({
      where: {
        id: candidateId,
        ...buildCandidateVisibilityWhere(role, userId ?? undefined),
      },
      select: { id: true },
    }))
  ) {
    return apiError("FORBIDDEN", "You do not have access to this candidate", 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const jobId = typeof body.resumeParseJobId === "string" ? body.resumeParseJobId.trim() : "";
  const result = body.result;

  if (!jobId || !isValidCuid(jobId)) {
    return apiError("VALIDATION_ERROR", "resumeParseJobId must be a valid id", 400);
  }
  if (!isResumeParseResult(result)) {
    return apiError("VALIDATION_ERROR", "result must match ResumeParseResult (name, skills, experience)", 400);
  }

  const job = await prisma.resumeParseJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      candidateId: true,
      status: true,
      fileHash: true,
    },
  });

  if (!job || job.candidateId !== candidateId) {
    return apiError("NOT_FOUND", "Parse job not found for this candidate", 404);
  }
  if (job.status !== "DONE") {
    return apiError("INVALID_STATE", "Parse job must be completed before applying", 409);
  }

  const years = Math.round(
    Math.min(60, Math.max(0, Number.isFinite(result.experience.years) ? result.experience.years : 0))
  );

  const MAX_SKILLS = 50;
  const MAX_NAME_LEN = 200;

  const skillRows = result.skills
    .slice(0, MAX_SKILLS)
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((skillName) => ({ candidateId, skillName: skillName.slice(0, 200) }));

  const detailsSerialized = serializeActivityLogDetails(
    buildResumeParseAppliedToCandidateDetails(job.id, job.fileHash)
  );
  if (detailsSerialized.ok === false) {
    return apiError(detailsSerialized.code, detailsSerialized.message, 400);
  }

  const candidateName = result.name.trim();
  if (!candidateName) {
    return apiError("VALIDATION_ERROR", "result.name cannot be empty", 400);
  }
  if (candidateName.length > MAX_NAME_LEN) {
    return apiError("VALIDATION_ERROR", `result.name must be at most ${MAX_NAME_LEN} characters`, 400);
  }

  try {
    // Use a batch transaction (array form) so dev-time route compilation or slower I/O
    // doesn't hit Prisma interactive transaction timeout (default ~5s).
    const ops: Parameters<typeof prisma.$transaction>[0] = [
      prisma.candidateSkill.deleteMany({ where: { candidateId } }),
      ...(skillRows.length > 0 ? [prisma.candidateSkill.createMany({ data: skillRows })] : []),
      prisma.candidate.update({
        where: { id: candidateId },
        data: {
          candidateName,
          totalExperience: years,
          relevantExperience: years,
        },
      }),
      prisma.activityLog.create({
        data: {
          candidateId,
          userId,
          action: ACTIVITY_ACTION_RESUME_PARSE_APPLIED_TO_CANDIDATE,
          details: detailsSerialized.json,
        },
      }),
    ];
    await prisma.$transaction(ops);

    const updated = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: candidateDetailInclude,
    });
    if (!updated) {
      return apiError("NOT_FOUND", "Candidate not found", 404);
    }
    return NextResponse.json(formatCandidateDetail(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError("APPLY_FAILED", msg, 500);
  }
}
