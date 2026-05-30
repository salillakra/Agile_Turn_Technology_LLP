import { PrismaClient } from "@prisma/client";
import { buildCandidateVisibilityWhere, buildJobVisibilityWhere } from "../src/lib/rbac-scope";
import { recommendJobs } from "../src/lib/recommendation-engine";
import { filterRecommendationsByThreshold } from "../src/lib/recommendation-config";
import { normalizeSkills } from "../src/lib/skill-normalizer";

const prisma = new PrismaClient();

async function runForCandidate(candidateId: string, role: string, userId?: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      skills: true,
      normalizedSkills: true,
      totalExperience: true,
      relevantExperience: true,
      preferredWorkLocation: true,
      currentDesignation: true,
      positionRole: true,
      candidateSkills: { select: { skillName: true } },
      applications: { select: { id: true, jobId: true } },
    },
  });
  if (!candidate) {
    console.log(candidateId, "NOT FOUND");
    return;
  }

  const visible = await prisma.candidate.findFirst({
    where: { id: candidateId, ...buildCandidateVisibilityWhere(role, userId) },
    select: { id: true },
  });
  console.log(
    candidateId,
    "role",
    role,
    "apps",
    candidate.applications.length,
    "visible",
    !!visible
  );

  if (!visible) return;

  const jobs = await prisma.job.findMany({
    where: { status: "OPEN", ...buildJobVisibilityWhere(role, userId) },
    select: {
      id: true,
      title: true,
      location: true,
      yearsOfExperience: true,
      requiredSkills: true,
      preferredSkills: true,
      jobMeta: true,
    },
  });

  const rawSkills =
    candidate.skills.length > 0
      ? candidate.skills
      : candidate.candidateSkills.map((s) => s.skillName).filter(Boolean);
  const normalizedSkills =
    candidate.normalizedSkills.length > 0
      ? candidate.normalizedSkills
      : normalizeSkills(rawSkills);

  const ranked = recommendJobs(
    {
      id: candidate.id,
      skills: rawSkills,
      normalizedSkills,
      totalExperience: candidate.totalExperience,
      relevantExperience: candidate.relevantExperience,
      preferredWorkLocation: candidate.preferredWorkLocation,
      currentDesignation: candidate.currentDesignation,
      positionRole: candidate.positionRole,
    },
    jobs.map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location,
      yearsOfExperience: j.yearsOfExperience,
      requiredSkills: j.requiredSkills,
      preferredSkills: j.preferredSkills,
      jobMeta: j.jobMeta,
    }))
  );
  const body = filterRecommendationsByThreshold(ranked, 40);
  console.log("  jobs visible", jobs.length, "recs", body.length);
}

async function main() {
  const latest = await prisma.candidate.findFirst({
    where: { candidateName: { contains: "Sahil", mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!latest) {
    console.log("no sahil");
    return;
  }

  const recruiters = await prisma.user.findMany({
    where: { role: "RECRUITER" },
    take: 2,
    select: { id: true, email: true },
  });

  await runForCandidate(latest.id, "ADMIN");
  for (const u of recruiters) {
    await runForCandidate(latest.id, "RECRUITER", u.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
