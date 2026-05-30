import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const users = await p.user.findMany({ select: { id: true, email: true, role: true } });
const assignments = await p.jobAssignment.findMany({ select: { userId: true, jobId: true } });
console.log(JSON.stringify({ users, assignments }, null, 2));
await p.$disconnect();
