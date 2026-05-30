import { PrismaClient } from "@prisma/client";
import { recommendJobs } from "../src/lib/recommendation-engine";
import { filterRecommendationsByThreshold } from "../src/lib/recommendation-config";
import { normalizeSkills } from "../src/lib/skill-normalizer";
import { logRecommendationGenerated } from "../src/lib/recommendation-activity-log";

const prisma = new PrismaClient();

async function main() {
  const candidate = await prisma.candidate.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      candidateName: true,
      skills: true,
      normalizedSkills: true,
      totalExperience: true,
      relevantExperience: true,
      preferredWorkLocation: true,
      currentDesignation: true,
      positionRole: true,
      candidateSkills: { select: { skillName: true } },
    },
  });
  if (!candidate) {
    console.log("No candidates");
    return;
  }
  console.log("candidate:", candidate.id, candidate.candidateName);

  const jobs = await prisma.job.findMany({
    where: { status: "OPEN" },
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
  console.log("open jobs:", jobs.length);

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
  const body = filterRecommendationsByThreshold(ranked, 40).map((row) => ({
    jobId: row.jobId,
    title: row.title,
    matchScore: row.matchScore,
    matchedSkills: row.matchedSkills,
    missingSkills: row.missingSkills,
  }));
  console.log("recommendations:", body.length);

  await logRecommendationGenerated({
    candidateId: candidate.id,
    userId: undefined,
    recommendedJobs: body.map((r) => ({
      jobId: r.jobId,
      title: r.title,
      matchScore: r.matchScore,
    })),
  });
  console.log("activity log ok");
}

main()
  .catch((e) => {
    console.error("FAIL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
