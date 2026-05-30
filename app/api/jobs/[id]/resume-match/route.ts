import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { canCreateCandidate } from "@/src/lib/rbac";
import { canAccessJobByScope, buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";
import { computeResumeSha256HexFromResumeUrl } from "@/src/lib/resume-file-hash";
import { computeSkillMatchPercent } from "@/src/lib/resume-job-match";

export type ResumeMatchResponseBody = {
  eligible: boolean;
  reason:
    | "OK"
    | "THRESHOLD_NOT_CONFIGURED"
    | "JOB_HAS_NO_REQUIRED_SKILLS"
    | "NO_RESUME"
    | "INVALID_RESUME_REFERENCE"
    | "RESUME_FILE_MISSING"
    | "PARSE_NOT_DONE"
    | "PARSE_NOT_APPLIED"
    | "BELOW_THRESHOLD";
  requiredThreshold: number | null;
  matchPercent: number | null;
  requiredSkillsCount: number | null;
  matchedSkillsCount: number | null;
  /** Debug fields (kept lightweight). */
  requiredSkills?: string[];
  candidateSkillsSample?: string[];
};

function parseJobMeta(jobMeta: unknown): {
  threshold: number | null;
  requiredSkills: string[];
} {
  const obj =
    jobMeta != null && typeof jobMeta === "object" && !Array.isArray(jobMeta)
      ? (jobMeta as Record<string, unknown>)
      : null;
  const thresholdRaw = obj?.resumeMatchThreshold;
  const threshold =
    thresholdRaw === null || thresholdRaw === undefined || thresholdRaw === ""
      ? null
      : Number(thresholdRaw);
  const requiredSkillsRaw = obj?.requiredSkills;
  const requiredSkills = Array.isArray(requiredSkillsRaw)
    ? requiredSkillsRaw
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  return {
    threshold: threshold != null && Number.isFinite(threshold) ? threshold : null,
    requiredSkills,
  };
}

/** GET /api/jobs/[id]/resume-match?candidateId=... — compute eligibility + match % (non-LLM). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(canCreateCandidate);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  const jobId = typeof id === "string" ? id.trim() : "";
  if (!jobId || !isValidCuid(jobId)) return apiError("INVALID_ID", "Malformed job id", 400);
  if (!(await canAccessJobByScope(role, userId, jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  const { searchParams } = new URL(request.url);
  const candidateId = searchParams.get("candidateId")?.trim() ?? "";
  if (!candidateId || !isValidCuid(candidateId)) return apiError("INVALID_ID", "Malformed candidate id", 400);

  const [job, candidate] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, select: { id: true, jobMeta: true } }),
    prisma.candidate.findFirst({
      where: { id: candidateId, ...buildCandidateVisibilityWhere(role, userId) },
      select: { id: true, resumeUrl: true },
    }),
  ]);
  if (!job) return apiError("NOT_FOUND", "Job not found", 404);
  if (!candidate) return apiError("NOT_FOUND", "Candidate not found", 404);

  const { threshold, requiredSkills } = parseJobMeta(job.jobMeta);
  if (threshold == null || threshold <= 0) {
    const body: ResumeMatchResponseBody = {
      eligible: true,
      reason: "THRESHOLD_NOT_CONFIGURED",
      requiredThreshold: threshold,
      matchPercent: null,
      requiredSkillsCount: requiredSkills.length,
      matchedSkillsCount: null,
    };
    return NextResponse.json(body);
  }
  if (requiredSkills.length === 0) {
    const body: ResumeMatchResponseBody = {
      eligible: true,
      reason: "JOB_HAS_NO_REQUIRED_SKILLS",
      requiredThreshold: threshold,
      matchPercent: null,
      requiredSkillsCount: 0,
      matchedSkillsCount: null,
    };
    return NextResponse.json(body);
  }

  const resumeUrl = typeof candidate.resumeUrl === "string" ? candidate.resumeUrl.trim() : "";
  if (!resumeUrl) {
    const body: ResumeMatchResponseBody = {
      eligible: false,
      reason: "NO_RESUME",
      requiredThreshold: threshold,
      matchPercent: null,
      requiredSkillsCount: requiredSkills.length,
      matchedSkillsCount: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  const hashed = await computeResumeSha256HexFromResumeUrl(resumeUrl);
  if (hashed.ok === false) {
    const body: ResumeMatchResponseBody = {
      eligible: false,
      reason: hashed.reason === "INVALID_URL" ? "INVALID_RESUME_REFERENCE" : "RESUME_FILE_MISSING",
      requiredThreshold: threshold,
      matchPercent: null,
      requiredSkillsCount: requiredSkills.length,
      matchedSkillsCount: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  const done = await prisma.resumeParseJob.findFirst({
    where: { candidateId, fileHash: hashed.hash, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!done) {
    const body: ResumeMatchResponseBody = {
      eligible: false,
      reason: "PARSE_NOT_DONE",
      requiredThreshold: threshold,
      matchPercent: null,
      requiredSkillsCount: requiredSkills.length,
      matchedSkillsCount: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  const skills = await prisma.candidateSkill.findMany({
    where: { candidateId },
    select: { skillName: true },
    take: 500,
  });
  const candidateSkills = skills.map((s) => s.skillName);
  if (candidateSkills.length === 0) {
    const body: ResumeMatchResponseBody = {
      eligible: false,
      reason: "PARSE_NOT_APPLIED",
      requiredThreshold: threshold,
      matchPercent: null,
      requiredSkillsCount: requiredSkills.length,
      matchedSkillsCount: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  const match = computeSkillMatchPercent({ requiredSkills, candidateSkills });
  const debugCandidateSample = candidateSkills.slice(0, 30);
  if (match.percent < threshold) {
    const body: ResumeMatchResponseBody = {
      eligible: false,
      reason: "BELOW_THRESHOLD",
      requiredThreshold: threshold,
      matchPercent: match.percent,
      requiredSkillsCount: match.required,
      matchedSkillsCount: match.matched,
      requiredSkills,
      candidateSkillsSample: debugCandidateSample,
    };
    return NextResponse.json(body, { status: 200 });
  }

  const body: ResumeMatchResponseBody = {
    eligible: true,
    reason: "OK",
    requiredThreshold: threshold,
    matchPercent: match.percent,
    requiredSkillsCount: match.required,
    matchedSkillsCount: match.matched,
    requiredSkills,
    candidateSkillsSample: debugCandidateSample,
  };
  return NextResponse.json(body);
}

