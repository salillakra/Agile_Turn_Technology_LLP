import { requireAuth } from "@/src/lib/auth";
import { isAdmin } from "@/src/lib/rbac";
import Sidebar from "@/components/Sidebar";
import PageTransition from "@/components/PageTransition";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { getDashboardSidebarNavCounts } from "@/src/lib/dashboard-sidebar-nav";

export default async function DashboardLayout({ children }) {
  const session = await requireAuth();
  const nav = await getDashboardSidebarNavCounts({
    role: session.user?.role,
    userId: session.user?.id,
  });
  return (
    <div className="flex min-h-screen bg-[var(--app-bg)] font-sans text-[var(--text-body)] transition-colors duration-200 dark:text-slate-300">
      <Sidebar
        jobsCount={nav.jobsCount}
        applicantsCount={nav.applicantsCount}
        hiredCount={nav.hiredCount}
        activeCount={nav.activeCount}
        showQueueMonitor={isAdmin(session.user?.role)}
        showEmailMonitoring={isAdmin(session.user?.role)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-end gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-6 py-3 transition-colors duration-200">
          <ThemeToggle />
          <NotificationBell />
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-7 py-8 transition-colors duration-200">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
