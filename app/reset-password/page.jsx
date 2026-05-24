"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("Missing reset token. Open the link from your email again.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Reset failed.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!token && !done) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--app-bg)] px-6 py-8 transition-colors">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>
        <div className="p-6 text-center text-sm text-[var(--text-muted)]">
          <p className="mb-2">Invalid or missing reset link.</p>
          <Link href="/forgot-password" className="font-semibold text-blue-600 dark:text-blue-400">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--app-bg)] px-6 py-8 transition-colors duration-200">
      <div className="absolute right-4 top-4 z-10 md:right-8 md:top-8">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-7 shadow-xl transition-colors duration-200">
        <h1 className="m-0 mb-2 font-['Fraunces',serif] text-xl font-bold text-[var(--text-heading-soft)]">
          Set new password
        </h1>
        <p className="mb-6 text-[13px] text-[var(--text-muted)]">
          Choose a strong password at least 8 characters long.
        </p>

        {done ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Password updated. Redirecting to sign in…</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-[10px] border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-[13px] text-red-600 dark:text-red-400"
              >
                {error}
              </div>
            )}
            <label className="mb-[18px] block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="••••••••"
                className="box-border w-full rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-3 text-sm text-[var(--text-heading-soft)] transition-colors"
              />
            </label>
            <label className="mb-[18px] block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">Confirm password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="••••••••"
                className="box-border w-full rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-3 text-sm text-[var(--text-heading-soft)] transition-colors"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-[10px] border-none bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-3.5 text-sm font-semibold text-white opacity-100 transition-opacity disabled:cursor-not-allowed disabled:opacity-80"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[13px] text-[var(--text-muted)]">
          <Link href="/login" className="font-semibold text-blue-600 no-underline dark:text-blue-400">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] font-['DM_Mono',monospace] text-[13px] text-[var(--text-muted)]">
          Loading…
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
