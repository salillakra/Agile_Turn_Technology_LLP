import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate } from "@/src/lib/rbac";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";
import { isResumeParseResult } from "@/src/lib/resume-parse-result";
import { syncCandidateFromResumeParse } from "@/src/lib/candidate-parse-sync";
import { RESUME_APPLY_LIMITS } from "@/src/lib/resume-parse-limits";
import { truncateSummaryWithFullStop } from "@/src/lib/text-terminal-punctuation";
import { isStructuredResumeParse } from "@/src/lib/structured-resume-parse";
import {
  buildResumeParseAppliedToCandidateDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import {
  candidateDetailInclude,
  formatCandidateDetail,
} from "@/src/lib/candidate-detail-response";
import { ACTIVITY_ACTION_RESUME_PARSE_APPLIED_TO_CANDIDATE } from "@/src/lib/resume-parse-activity-log";
import { enqueueCandidateEmbedding } from "@/src/lib/enqueue-entity-embedding";
import { enqueueCandidateEmbeddingAfterParse } from "@/src/lib/resume-parse-embedding";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/candidates/[id]/resume/parse/apply
 *
 * Persists recruiter-reviewed parse output onto `Candidate` (skills, experience, structured NLP profile).
 * Body: `{ resumeParseJobId, result }` where `result` matches `ResumeParseResult`.
 * Optional `structured` (schema v8) overrides embedded `result.structured` for summary, companies, education, certifications.
 * The job must be `COMPLETED` for this candidate.
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
  const structuredBody = body.structured;

  if (!jobId || !isValidCuid(jobId)) {
    return apiError("VALIDATION_ERROR", "resumeParseJobId must be a valid id", 400);
  }
  if (!isResumeParseResult(result)) {
    return apiError("VALIDATION_ERROR", "result must match ResumeParseResult (name, skills, experience)", 400);
  }
  if (structuredBody !== undefined && !isStructuredResumeParse(structuredBody)) {
    return apiError("VALIDATION_ERROR", "structured must match StructuredResumeParse (schema v8)", 400);
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
  if (job.status !== "COMPLETED") {
    return apiError("INVALID_STATE", "Parse job must be completed before applying", 409);
  }

  const years = Math.round(
    Math.min(60, Math.max(0, Number.isFinite(result.experience.years) ? result.experience.years : 0))
  );

  const { MAX_SKILLS, MAX_SKILL_LEN, MAX_NAME_LEN, MAX_SUMMARY_LEN } = RESUME_APPLY_LIMITS;

  const rawSkills = result.skills
    .slice(0, MAX_SKILLS)
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((s) => s.slice(0, MAX_SKILL_LEN));

  const experienceSummary = truncateSummaryWithFullStop(
    result.experience.summary,
    MAX_SUMMARY_LEN
  );
  const skillRows = rawSkills.map((skillName) => ({ candidateId, skillName }));

  const structuredParse =
    structuredBody !== undefined ? structuredBody : result.structured;
  const structuredOrNull = isStructuredResumeParse(structuredParse) ? structuredParse : null;

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
    await prisma.$transaction(async (tx) => {
      await tx.candidateSkill.deleteMany({ where: { candidateId } });
      if (skillRows.length > 0) {
        await tx.candidateSkill.createMany({ data: skillRows });
      }
      await tx.candidate.update({
        where: { id: candidateId },
        data: { candidateName },
      });
      await syncCandidateFromResumeParse(tx, {
        candidateId,
        result: {
          ...result,
          skills: rawSkills,
          experience: { years, summary: experienceSummary },
        },
        structured: structuredOrNull,
      });
      await tx.activityLog.create({
        data: {
          candidateId,
          userId,
          action: ACTIVITY_ACTION_RESUME_PARSE_APPLIED_TO_CANDIDATE,
          details: detailsSerialized.json,
        },
      });
    });

    const updated = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: candidateDetailInclude,
    });
    if (!updated) {
      return apiError("NOT_FOUND", "Candidate not found", 404);
    }

    void enqueueCandidateEmbeddingAfterParse(candidateId).catch((e) => {
      console.error("[POST .../resume/parse/apply] embedding enqueue failed:", e);
    });

    return NextResponse.json(formatCandidateDetail(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError("APPLY_FAILED", msg, 500);
  }
}
