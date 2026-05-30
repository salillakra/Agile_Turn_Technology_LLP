import { PrismaClient } from "@prisma/client";
import { recommendJobs } from "../src/lib/recommendation-engine.ts";
import { filterRecommendationsByThreshold } from "../src/lib/recommendation-config.ts";
import { normalizeSkills } from "../src/lib/skill-normalizer.ts";

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
    console.log("No candidates in DB");
    return;
  }
  console.log("Candidate:", candidate.id, candidate.candidateName);

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
    take: 5,
  });
  console.log("Open jobs sample:", jobs.length);

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
  const above = filterRecommendationsByThreshold(ranked, 40);
  console.log("Ranked:", ranked.length, "Above threshold:", above.length);
  console.log("OK");
}

main()
  .catch((e) => {
    console.error("FAIL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
