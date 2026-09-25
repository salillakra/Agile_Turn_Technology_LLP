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

function applyCandidateSoftDelete(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: "candidateSoftDelete",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model !== "Candidate") return query(args);
          if (
            operation === "findUnique" ||
            operation === "findFirst" ||
            operation === "findMany" ||
            operation === "count" ||
            operation === "aggregate" ||
            operation === "groupBy"
          ) {
            const a = args as { where?: Record<string, unknown> };
            if (a.where && !("deletedAt" in a.where)) {
              a.where = { ...a.where, deletedAt: null };
            } else if (!a.where) {
              a.where = { deletedAt: null };
            }
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  const pool = globalForPrisma.pgPool ?? createPgPool();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
  return applyCandidateSoftDelete(client);
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
