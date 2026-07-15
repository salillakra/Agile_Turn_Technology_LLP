import { requireAuth } from "@/src/lib/auth";
import { isAdmin } from "@/src/lib/rbac";
import AppSidebar from "@/components/Sidebar";
import PageTransition from "@/components/PageTransition";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getDashboardSidebarNavCounts } from "@/src/lib/dashboard-sidebar-nav";
import { themeConfig } from "@/lib/theme";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const nav = await getDashboardSidebarNavCounts({
    role: session.user?.role,
    userId: session.user?.id,
  });
  return (
    <SidebarProvider>
      <AppSidebar
        jobsCount={nav.jobsCount}
        applicantsCount={nav.applicantsCount}
        hiredCount={nav.hiredCount}
        activeCount={nav.activeCount}
        showQueueMonitor={isAdmin(session.user?.role)}
        showEmailMonitoring={isAdmin(session.user?.role)}
        showCrm={isAdmin(session.user?.role)}
      />
      <SidebarInset className="min-w-0 overflow-hidden bg-background">
        <header className="sticky top-0 z-20 flex h-[var(--header-height,3.25rem)] shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <p className="hidden text-xs text-muted-foreground sm:block">
            {themeConfig.brand.tagline}
          </p>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[var(--content-max-width,90rem)] flex-1 overflow-x-hidden overflow-y-auto p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
