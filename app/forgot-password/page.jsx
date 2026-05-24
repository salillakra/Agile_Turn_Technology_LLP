"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setDevResetUrl("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setDone(true);
      if (typeof data.devResetUrl === "string" && data.devResetUrl) {
        setDevResetUrl(data.devResetUrl);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--app-bg)] px-6 py-8 transition-colors duration-200">
      <div className="absolute right-4 top-4 z-10 md:right-8 md:top-8">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-7 shadow-xl transition-colors duration-200">
        <h1 className="m-0 mb-2 font-['Fraunces',serif] text-xl font-bold text-[var(--text-heading-soft)]">
          Forgot password
        </h1>
        <p className="mb-6 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Enter your email. If an account exists, you can reset your password. In production, you would
          receive an email; in development, use the link below if shown.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-[10px] border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-[13px] text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        )}

        {!done ? (
          <form onSubmit={handleSubmit}>
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
            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-[10px] border-none bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-3.5 text-sm font-semibold text-white opacity-100 transition-opacity disabled:cursor-not-allowed disabled:opacity-80"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : (
          <div>
            <p className="mb-4 text-sm text-[var(--text-body)]">
              If an account exists for that email, check your inbox (when email is configured). We never
              reveal whether the email was found.
            </p>
            {devResetUrl && (
              <div className="mb-4 break-all rounded-[10px] border border-blue-400/25 bg-blue-500/10 px-3.5 py-3 text-xs text-blue-800 dark:text-blue-200">
                <strong className="mb-2 block">Development only</strong>
                <a href={devResetUrl} className="text-blue-600 underline dark:text-blue-400">
                  {devResetUrl}
                </a>
              </div>
            )}
          </div>
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
