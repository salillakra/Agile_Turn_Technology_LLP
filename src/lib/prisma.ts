import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { normalizeDatabaseUrl } from "@/src/lib/normalize-database-url";

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
}

/**
 * Reusable Prisma client singleton for Next.js (Prisma ORM v7 + driver adapter).
 */
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  pgPool?: pg.Pool;
};

function createPgPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new pg.Pool({ connectionString });
}

function createPrismaClient(): PrismaClient {
  const pool = globalForPrisma.pgPool ?? createPgPool();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

/** Dev hot-reload can keep an old singleton from before new models were generated. */
function isStalePrismaClient(client: PrismaClient): boolean {
  return typeof (client as PrismaClient & { interview?: { findMany?: unknown } }).interview
    ?.findMany !== "function";
}

let prismaInstance = globalForPrisma.prisma;
if (prismaInstance && isStalePrismaClient(prismaInstance)) {
  void prismaInstance.$disconnect().catch(() => {});
  prismaInstance = undefined;
  globalForPrisma.prisma = undefined;
}

export const prisma = prismaInstance ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
