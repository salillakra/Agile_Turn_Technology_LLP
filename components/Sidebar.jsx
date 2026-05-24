"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const nav = [
  { id: "dashboard", href: "/dashboard", icon: "⬡", label: "Dashboard" },
  { id: "jobs", href: "/jobs", icon: "📋", label: "Jobs" },
  { id: "applicants", href: "/applicants", icon: "👥", label: "Applicants" },
  { id: "kanban", href: "/kanban", icon: "⊞", label: "Kanban" },
  { id: "reports", href: "/reports", icon: "📊", label: "Reports" },
  { id: "users", href: "/users", icon: "👤", label: "Users" },
  { id: "profile", href: "/profile", icon: "◉", label: "Profile" },
];

export default function Sidebar({ jobsCount = 0, applicantsCount = 0, hiredCount = 0, activeCount = 0 }) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Main navigation"
      className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-surface)] transition-colors duration-200"
    >
      <div className="border-b border-[var(--app-border)] px-5 pb-5 pt-6 transition-colors duration-200">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-blue-500 to-violet-500 text-[17px]">
            ◈
          </div>
          <div>
            <p className="m-0 font-['Fraunces',serif] text-[15px] font-extrabold leading-tight tracking-tight text-[var(--text-heading)]">
              AGILE TURN TECHNOLOGY LLP
            </p>
            <p className="m-0 text-[9px] uppercase tracking-wider text-[var(--text-muted)]" style={{ fontFamily: "'DM Mono',monospace" }}>
              Recruitment Suite
            </p>
          </div>
        </div>
      </div>
      <nav aria-label="Primary" className="flex-1 px-3 py-3.5">
        {nav.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.id}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-[9px] border px-3 py-2 text-[13px] no-underline outline-offset-2 transition-all duration-150 ${
                active
                  ? "border-blue-500/25 bg-blue-500/10 font-bold text-blue-600 dark:border-blue-500/25 dark:bg-blue-500/12 dark:text-[var(--nav-active)]"
                  : "border-transparent font-medium text-slate-700 hover:bg-slate-100/80 dark:text-slate-500 dark:hover:bg-white/[0.04]"
              } `}
            >
              <span className="text-sm">{n.icon}</span>
              {n.label}
              {active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--app-border)] px-4 py-3.5 transition-colors duration-200">
        <div role="group" aria-label="Recruitment snapshot counts" className="grid grid-cols-2 gap-2">
          {[
            { label: "Jobs", value: jobsCount, color: "#60A5FA" },
            { label: "Candidates", value: applicantsCount, color: "#A78BFA" },
            { label: "Hired", value: hiredCount, color: "#34D399" },
            { label: "Active", value: activeCount, color: "#FB923C" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-slate-100/90 px-2.5 py-2 dark:bg-white/[0.03]">
              <p
                aria-label={`${s.label}: ${s.value}`}
                className="m-0 font-['Fraunces',serif] text-base font-extrabold"
                style={{ color: s.color }}
              >
                {s.value}
              </p>
              <p className="m-0 text-[9px] uppercase text-[var(--text-muted)]" style={{ fontFamily: "'DM Mono',monospace" }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className="mt-3 w-full cursor-pointer rounded-[9px] border border-[var(--app-border)] bg-slate-50 py-2 px-3 text-[13px] font-medium text-slate-800 outline-offset-2 transition-all duration-150 hover:bg-slate-100 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08]"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
