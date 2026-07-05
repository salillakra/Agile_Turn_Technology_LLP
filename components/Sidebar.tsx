"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMemo } from "react";
import {
  SquaresFour,
  Buildings,
  Briefcase,
  Users,
  Sparkle,
  Kanban,
  ChartBar,
  ClockCounterClockwise,
  UserGear,
  UserCircle,
  EnvelopeSimple,
  SignOut,
  SignOutIcon,
} from "@phosphor-icons/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import QueueMonitorLink from "@/components/QueueMonitorLink";
import { themeConfig } from "@/lib/theme";

const NAV_ITEMS = [
  { id: "dashboard", href: "/dashboard", icon: SquaresFour, label: "Dashboard" },
  { id: "crm", href: "/crm", icon: Buildings, label: "CRM" },
  { id: "jobs", href: "/jobs", icon: Briefcase, label: "Jobs" },
  { id: "applicants", href: "/applicants", icon: Users, label: "Applicants" },
  { id: "search", href: "/search", icon: Sparkle, label: "AI Search" },
  { id: "kanban", href: "/kanban", icon: Kanban, label: "Kanban" },
  { id: "reports", href: "/reports", icon: ChartBar, label: "Reports" },
  { id: "logs", href: "/logs", icon: ClockCounterClockwise, label: "Logs" },
  { id: "users", href: "/users", icon: UserGear, label: "Users" },
  { id: "profile", href: "/profile", icon: UserCircle, label: "Profile" },
];

export default function AppSidebar({
  jobsCount = 0,
  applicantsCount = 0,
  hiredCount = 0,
  activeCount = 0,
  showQueueMonitor = false,
  showEmailMonitoring = false,
}) {
  const pathname = usePathname();

  const navItems = useMemo(() => {
    if (!showEmailMonitoring) return NAV_ITEMS;
    const out = [...NAV_ITEMS];
    const idx = out.findIndex((n) => n.id === "reports");
    const insertAt = idx >= 0 ? idx + 1 : out.length;
    out.splice(insertAt, 0, {
      id: "email-monitoring",
      href: "/admin/email-monitoring",
      icon: EnvelopeSimple,
      label: "Email Monitoring",
    });
    return out;
  }, [showEmailMonitoring]);

  const stats = [
    { label: "Jobs", value: jobsCount },
    { label: "Candidates", value: applicantsCount },
    { label: "Hired", value: hiredCount },
    { label: "Active", value: activeCount },
  ];

  return (
    <Sidebar collapsible="icon">
      {/* ── Brand header ─────────────────────────────────────────────── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                {themeConfig.brand.monogram}
              </div>
              <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold tracking-[-0.02em]">{themeConfig.brand.name}</span>
                <span className="text-eyebrow normal-case">
                  {themeConfig.brand.tagline}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      {/* ── Main navigation ───────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.id === "jobs" && jobsCount > 0 && (
                      <SidebarMenuBadge>{jobsCount}</SidebarMenuBadge>
                    )}
                    {item.id === "applicants" && applicantsCount > 0 && (
                      <SidebarMenuBadge>{applicantsCount}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
              {showQueueMonitor && (
                <SidebarMenuItem>
                  <QueueMonitorLink />
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Stats ─────────────────────────────────────────────────── */}
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent>
            <div className="grid grid-cols-2 gap-1.5 px-2 py-1">
              {stats.map((s) => (
                <div key={s.label} className="rounded-md border border-border bg-card px-2.5 py-2">
                  <p className="text-sm font-semibold tabular-nums">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer / sign out ─────────────────────────────────────────── */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-muted-foreground hover:text-destructive"
              tooltip="Sign out"
            >
              <SignOutIcon />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
