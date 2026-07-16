import { prisma } from "@/src/lib/prisma";
import type { Role } from "@prisma/client";
import { listScopedJobIds } from "@/src/lib/rbac-scope";

export type DashboardSidebarNavCounts = {
  jobsCount: number;
  applicantsCount: number;
  hiredCount: number;
  activeCount: number;
};

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
    const ownedJobIds = await listScopedJobIds(role, userId);

    if (ownedJobIds !== null) {
      if (ownedJobIds.length === 0) return { ...ZERO_COUNTS };

      const [hiredCount, applicantsCount, activeCount] = await Promise.all([
        prisma.application.count({
          where: { jobId: { in: ownedJobIds }, stage: "HIRED", withdrawnAt: null },
        }),
        prisma.application.count({
          where: { jobId: { in: ownedJobIds }, withdrawnAt: null },
        }),
        prisma.job.count({ where: { id: { in: ownedJobIds }, status: "OPEN" } }),
      ]);

      return {
        jobsCount: ownedJobIds.length,
        applicantsCount,
        hiredCount,
        activeCount,
      };
    }

    const [jobsCount, applicantsCount, hiredCount, activeCount] = await Promise.all([
      prisma.job.count(),
      prisma.application.count({ where: { withdrawnAt: null } }),
      prisma.application.count({ where: { stage: "HIRED", withdrawnAt: null } }),
      prisma.job.count({ where: { status: "OPEN" } }),
    ]);

    return { jobsCount, applicantsCount, hiredCount, activeCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[getDashboardSidebarNavCounts] Sidebar counts unavailable (${msg.slice(0, 200)}). Using zeros.`
      );
    }
    return { ...ZERO_COUNTS };
  }
}
