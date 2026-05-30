const { PrismaClient } = require("@prisma/client");

async function main() {
  const candidateId = process.argv[2];
  if (!candidateId) {
    console.error("Usage: node scripts/check-parse-result.cjs <candidateId>");
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const job = await prisma.resumeParseJob.findFirst({
      where: { candidateId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, resultJson: true, error: true, createdAt: true },
    });
    console.log("job:", job?.id, job?.status, job?.createdAt);
    console.log("error:", job?.error);
    console.log("resultJson:", JSON.stringify(job?.resultJson, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

