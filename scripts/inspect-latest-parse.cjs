const { PrismaClient } = require("@prisma/client");

async function main() {
  const candidateId = process.argv[2];
  if (!candidateId) {
    console.error("Usage: node scripts/inspect-latest-parse.cjs <candidateId>");
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const j = await prisma.resumeParseJob.findFirst({
      where: { candidateId },
      orderBy: { createdAt: "desc" },
    });
    console.log({
      id: j?.id,
      status: j?.status,
      bullmqJobId: j?.bullmqJobId,
      attemptCount: j?.attemptCount,
      startedAt: j?.startedAt,
      completedAt: j?.completedAt,
      failedAt: j?.failedAt,
      resultJsonKeys: j?.resultJson ? Object.keys(j.resultJson) : null,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

