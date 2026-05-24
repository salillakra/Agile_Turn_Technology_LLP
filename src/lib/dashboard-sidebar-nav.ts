import { prisma } from "@/src/lib/prisma";
import type { Role } from "@prisma/client";

export type DashboardSidebarNavCounts = {
  jobsCount: number;
  applicantsCount: number;
  hiredCount: number;
  activeCount: number;
};

/**
 * Sidebar metrics aligned with dashboard summary job scope: ADMIN sees org-wide counts;
 * RECRUITER / HIRING_MANAGER see counts for jobs they are assigned to (`JobAssignment`).
 * If the database is unreachable, returns zero counts so the dashboard layout can still render.
 */
const ZERO_COUNTS: DashboardSidebarNavCounts = {
  jobsCount: 0,
  applicantsCount: 0,
  hiredCount: 0,
  activeCount: 0,
};

export async function getDashboardSidebarNavCounts(params: {
  role: Role | string | undefined;
  userId: string | undefined;
}): Promise<DashboardSidebarNavCounts> {
  return computeDashboardSidebarNavCounts(params);
}

async function computeDashboardSidebarNavCounts(params: {
  role: Role | string | undefined;
  userId: string | undefined;
}): Promise<DashboardSidebarNavCounts> {
  try {
    const { role, userId } = params;
    const isAdmin = role === "ADMIN";
    const scopedUserId = typeof userId === "string" ? userId.trim() : "";

    if (!isAdmin) {
      // Non-admin roles are scoped to assigned jobs (same policy as dashboard summary and applications API).
      const scopedJobs = await prisma.jobAssignment.findMany({
        where: { userId: scopedUserId },
        select: { jobId: true, job: { select: { status: true } } },
        distinct: ["jobId"],
      });
      const ids = scopedJobs.map((row) => row.jobId);
      if (ids.length === 0) {
        return {
          jobsCount: 0,
          applicantsCount: 0,
          hiredCount: 0,
          activeCount: 0,
        };
      }

      const [hiredCount, applicantsCount] = await Promise.all([
        prisma.application.count({
          where: {
            jobId: { in: ids },
            stage: "HIRED",
            withdrawnAt: null,
          },
        }),
        prisma.application.count({
          where: { jobId: { in: ids }, withdrawnAt: null },
        }),
      ]);

      return {
        jobsCount: ids.length,
        applicantsCount,
        hiredCount,
        activeCount: scopedJobs.filter((row) => row.job.status === "OPEN").length,
      };
    }

    // Admin sees org-wide counts, aligned to "Applicants" list (applications), not raw Candidate rows.
    const [jobsCount, applicantsCount, hiredCount, activeCount] = await Promise.all([
      prisma.job.count(),
      prisma.application.count({ where: { withdrawnAt: null } }),
      prisma.application.count({
        where: { stage: "HIRED", withdrawnAt: null },
      }),
      prisma.job.count({ where: { status: "OPEN" } }),
    ]);

    return { jobsCount, applicantsCount, hiredCount, activeCount };
  } catch (e) {
    // P1001 / connectivity: do not fail the whole dashboard layout; avoid rethrowing so RSC does not surface a hard error.
    const msg = e instanceof Error ? e.message : String(e);
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[getDashboardSidebarNavCounts] Sidebar counts unavailable (${msg.slice(0, 200)}). Using zeros. Check DATABASE_URL and that PostgreSQL is reachable.`
      );
    }
    return { ...ZERO_COUNTS };
  }
}
