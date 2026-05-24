"use client";

import { motion, useReducedMotion } from "framer-motion";
import Card from "@/components/ui/Card";
import { T } from "@/lib/helpers";

export default function ProfileCard({ profile, showStrength = true }) {
  const reduceMotion = useReducedMotion();
  if (!profile) return null;

  const pct = typeof profile.profileCompleteness === "number" ? profile.profileCompleteness : 0;
  const p = profile.profile || {};
  const img = profile.image?.trim();
  const subtitle = [profile.role, p.jobTitle].filter(Boolean).join(" · ");
  const personalEmail = p.personalEmail?.trim();

  const spring = { type: "spring", stiffness: 420, damping: 32 };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { ...spring, delay: 0.05 }}
    >
      <Card glass className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/12"
          aria-hidden
        />
        <div className="relative glass-shimmer-edge rounded-[inherit] px-[26px] py-[22px]">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <motion.div
              className="relative shrink-0"
              initial={reduceMotion ? false : { scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={reduceMotion ? { duration: 0 } : { ...spring, delay: 0.12 }}
            >
              <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-blue-500/35 via-violet-500/25 to-transparent blur-sm dark:from-blue-400/30" />
              <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/50 bg-[var(--app-surface)] shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:border-white/15 dark:shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-[var(--text-muted)]">
                    {(profile.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            </motion.div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              {showStrength ? (
                <>
                  <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-500" style={T.mono}>
                    Profile strength
                  </p>
                  <div className="mb-2 h-2.5 w-full max-w-md overflow-hidden rounded-full border border-[var(--app-border)]/40 bg-[var(--chrome-muted-bg)] shadow-inner">
                    <motion.div
                      className="relative h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 shadow-[0_0_12px_rgba(59,130,246,0.5)] dark:shadow-[0_0_16px_rgba(96,165,250,0.35)]"
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={reduceMotion ? { duration: 0 } : { ...spring, delay: 0.2 }}
                    />
                  </div>
                  <p className="m-0 text-xs text-[var(--text-muted)]">
                    {pct}% complete — add missing sections to improve your profile.
                  </p>
                </>
              ) : null}
              <motion.h2
                className="mt-4 mb-0 font-['Fraunces',serif] text-xl font-extrabold text-[var(--text-heading)]"
                initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.35, delay: 0.18 }}
              >
                {profile.name || "—"}
              </motion.h2>
              <p className="m-0 mt-1 break-all text-sm text-[var(--text-muted)]">{profile.email}</p>
              {personalEmail ? (
                <p className="m-0 mt-1 break-all text-xs text-[var(--text-mono)]">
                  Personal: <span className="text-[var(--text-body)]">{personalEmail}</span>
                </p>
              ) : null}
              {subtitle ? (
                <p className="m-0 mt-1 text-xs uppercase tracking-wide text-[var(--text-mono)]">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
