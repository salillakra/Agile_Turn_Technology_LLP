import { PrismaClient } from "@prisma/client";

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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
