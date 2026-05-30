import type { Prisma, PrismaClient } from "@prisma/client";

type CandidateWriteDb = Pick<PrismaClient, "candidate">;
import {
  candidateStructuredProfileFromLegacyResult,
  candidateStructuredProfileFromParse,
  educationToPrismaJson,
} from "@/src/lib/candidate-structured-profile";
import { normalizeSkills } from "@/src/lib/skill-normalizer";
import { invalidateCandidateScoringCaches } from "@/src/lib/ai/candidate-scoring-cache";
import { invalidateCandidateRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";
import type { ResumeParseResult } from "@/src/lib/resume-parse-result";
import type { StructuredResumeParse } from "@/src/lib/structured-resume-parse";
import { RESUME_APPLY_LIMITS } from "@/src/lib/resume-parse-limits";

const MAX_SKILLS = RESUME_APPLY_LIMITS.MAX_SKILLS;
const MAX_SKILL_LEN = RESUME_APPLY_LIMITS.MAX_SKILL_LEN;

export type SyncCandidateFromParseParams = {
  candidateId: string;
  result: ResumeParseResult;
  structured?: StructuredResumeParse | null;
};

/**
 * Persist NLP/heuristic parse output onto `Candidate` for matching and embeddings.
 */
export async function syncCandidateFromResumeParse(
  prisma: CandidateWriteDb,
  params: SyncCandidateFromParseParams
): Promise<void> {
  const structured = params.structured ?? params.result.structured ?? null;
  const profile = structured
    ? candidateStructuredProfileFromParse(structured)
    : candidateStructuredProfileFromLegacyResult(params.result);

  const rawSkills = params.result.skills
    .slice(0, MAX_SKILLS)
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((s) => s.slice(0, MAX_SKILL_LEN));

  const normalizedSkills = normalizeSkills(
    structured?.normalizedSkills?.length ? structured.normalizedSkills : rawSkills
  );

  const years = Math.round(
    Math.min(
      60,
      Math.max(
        0,
        Number.isFinite(
          structured?.totalExperience ?? params.result.experience.years
        )
          ? (structured?.totalExperience ?? params.result.experience.years)
          : 0
      )
    )
  );

  const data: Prisma.CandidateUpdateInput = {
    skills: rawSkills,
    normalizedSkills,
    totalExperience: years,
    relevantExperience: years,
    summary: profile.summary,
    companies: profile.companies,
    education: educationToPrismaJson(profile.education),
    certifications: profile.certifications,
  };

  if (structured?.currentDesignation) {
    data.currentDesignation = structured.currentDesignation.trim().slice(0, 200) || null;
  }

  await prisma.candidate.update({
    where: { id: params.candidateId },
    data,
  });

  void invalidateCandidateRecommendedCandidatesCaches(params.candidateId);
  void invalidateCandidateScoringCaches(params.candidateId);
}
