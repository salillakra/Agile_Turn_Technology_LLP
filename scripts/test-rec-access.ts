import { PrismaClient } from "@prisma/client";
import { canAccessCandidateForRecommendations } from "../src/lib/rbac-scope";

const prisma = new PrismaClient();

async function main() {
  const c = await prisma.candidate.findFirst({
    where: { candidateName: { contains: "Sahil", mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!c) return;
  const r = await prisma.user.findFirst({
    where: { role: "RECRUITER" },
    select: { id: true, email: true },
  });
  if (!r) return;
  const ok = await canAccessCandidateForRecommendations("RECRUITER", r.id, c.id);
  console.log("recruiter", r.email, "can access recommendations:", ok);
}

main()
  .finally(() => prisma.$disconnect());
