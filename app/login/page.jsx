"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

const ROLE_OPTIONS = [
  { value: "", label: "Any role (default)" },
  { value: "ADMIN", label: "Admin" },
  { value: "RECRUITER", label: "Recruiter" },
  { value: "HIRING_MANAGER", label: "Hiring manager" },
];

/** Avoids `Unexpected end of JSON input` when the response body is empty or not JSON (proxy errors, 502 HTML, etc.). */
async function parseJsonResponseSafe(res) {
  const text = await res.text();
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [expectedRole, setExpectedRole] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoLoading, setDemoLoading] = useState(null);
  /** Defer interactive form until after mount so browser extensions (e.g. `fdprocessedid` on inputs) cannot alter SSR DOM before React hydrates. */
  const [formMounted, setFormMounted] = useState(false);

  useEffect(() => {
    setFormMounted(true);
  }, []);

  useEffect(() => {
    fetch("/api/auth/demo-login-config", { credentials: "same-origin" })
      .then((r) => parseJsonResponseSafe(r))
      .then((d) => setDemoEnabled(!!d.demoLoginEnabled))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      remember: remember ? "true" : "false",
      expectedRole: expectedRole || "",
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setError(
        "Invalid email or password. If you chose a role under “Sign in as role”, pick “Any role (default)” or the role that matches your account (ADMIN / RECRUITER / HIRING_MANAGER)."
      );
      return;
    }
    if (res?.ok) router.push(callbackUrl);
  }

  async function handleDemoLogin(role) {
    setError("");
    setDemoLoading(role);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ role }),
      });
      const data = await parseJsonResponseSafe(res);
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Demo login failed.");
        return;
      }
      router.push(callbackUrl);
    } catch {
      setError("Demo login failed.");
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--app-bg)] px-6 py-8 transition-colors duration-200">
      <div className="absolute right-4 top-4 z-10 md:right-8 md:top-8">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-xl transition-colors duration-200 dark:shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
        <div className="border-b border-[var(--app-border)] px-7 pb-6 pt-8 text-center transition-colors duration-200">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-[22px]">
            ◈
          </div>
          <h1 className="m-0 font-['Fraunces',serif] text-[19px] font-extrabold leading-tight tracking-tight text-[var(--text-heading)]">
            Agile Turn Technology LLP
          </h1>
          <p className="mt-2 font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Recruitment Suite
          </p>
        </div>

        <div className="px-7 pb-8 pt-7">
          <h2 className="mb-6 m-0 font-['Fraunces',serif] text-xl font-bold text-[var(--text-heading-soft)]">
            Sign in
          </h2>
          {!formMounted ? (
            <div
              className="min-h-[320px] space-y-[18px]"
              aria-busy="true"
              aria-label="Loading sign-in form"
            >
              <div className="h-12 w-full animate-pulse rounded-[10px] bg-[var(--input-bg)] opacity-60" />
              <div className="h-12 w-full animate-pulse rounded-[10px] bg-[var(--input-bg)] opacity-60" />
              <div className="h-12 w-full animate-pulse rounded-[10px] bg-[var(--input-bg)] opacity-60" />
              <div className="h-12 w-full animate-pulse rounded-[10px] bg-gradient-to-br from-blue-500/40 to-blue-600/40" />
            </div>
          ) : (
          <form onSubmit={handleSubmit} suppressHydrationWarning>
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-[10px] border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-[13px] text-red-600 dark:text-red-400"
              >
                {error}
              </div>
            )}
            <label className="mb-[18px] block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="box-border w-full rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-3 text-sm text-[var(--text-heading-soft)] transition-colors"
              />
            </label>
            <label className="mb-[18px] block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="box-border w-full rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-3 text-sm text-[var(--text-heading-soft)] transition-colors"
              />
            </label>

            <label className="mb-[18px] block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">
                Sign in as role (optional)
              </span>
              <select
                value={expectedRole}
                onChange={(e) => setExpectedRole(e.target.value)}
                className="box-border w-full cursor-pointer rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-3 text-sm text-[var(--text-heading-soft)] transition-colors"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value || "any"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-[11px] text-[var(--text-muted)]">
                If you pick a role, your account must have that role or sign-in will fail.
              </span>
            </label>

            <div className="mb-[22px] flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-[var(--text-body)]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                Remember me
              </label>
              <Link href="/forgot-password" className="text-[13px] font-semibold text-blue-600 no-underline dark:text-blue-400">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-[10px] border-none bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-3.5 text-sm font-semibold text-white opacity-100 shadow-[0_4px_14px_rgba(59,130,246,0.35)] transition-opacity disabled:cursor-not-allowed disabled:opacity-80"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          )}

          {demoEnabled && (
            <div className="mt-6 border-t border-[var(--app-border)] pt-6 transition-colors">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Quick sign-in (demo)
              </p>
              <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
                First user in the database with each role. Enable with{" "}
                <code className="text-[var(--text-body)]">ENABLE_DEMO_AUTH=true</code> only in safe
                environments.
              </p>
              <div className="flex flex-wrap gap-2">
                {["ADMIN", "RECRUITER", "HIRING_MANAGER"].map((role) => (
                  <button
                    key={role}
                    type="button"
                    disabled={demoLoading !== null}
                    onClick={() => !demoLoading && handleDemoLogin(role)}
                    className={`rounded-lg border border-[var(--app-border)] bg-slate-100/80 px-3 py-2 text-xs font-semibold text-[var(--text-body)] transition-opacity dark:bg-white/[0.04] ${
                      demoLoading ? "cursor-wait" : "cursor-pointer"
                    } ${demoLoading && demoLoading !== role ? "opacity-50" : ""}`}
                  >
                    {demoLoading === role ? "…" : role.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 border-t border-[var(--app-border)] pt-6 text-center text-[13px] text-[var(--text-muted)] transition-colors">
            No account?{" "}
            <Link href="/register" className="font-semibold text-blue-600 no-underline dark:text-blue-400">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] font-['DM_Mono',monospace] text-[13px] text-[var(--text-muted)] transition-colors">
          Loading…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
