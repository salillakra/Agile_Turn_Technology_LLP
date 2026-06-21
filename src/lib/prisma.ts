import { PrismaClient } from "@prisma/client";
import { normalizeDatabaseUrl } from "@/src/lib/normalize-database-url";

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
}

/**
 * Reusable Prisma client singleton for Next.js.
 *
 * Why a singleton is necessary in Next.js:
 * - Next.js development mode uses Fast Refresh: modules are re-executed on file
 *   changes without restarting the process. Each re-execution would create a new
 *   PrismaClient and thus a new DB connection if we did not reuse one.
 * - PrismaClient manages a connection pool; creating many instances can exhaust
 *   the database connection limit and cause "too many connections" errors.
 * - By storing the client on globalThis in non-production, we reuse the same
 *   instance across hot reloads. In production, a single instance per process
 *   is still used via the ?? assignment.
 * - API routes and server code should import this single `prisma` export instead
 *   of instantiating PrismaClient themselves.
 */
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
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
