"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "RECRUITER" | "HIRING_MANAGER">("RECRUITER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Password and Confirm Password do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Registration failed.");
        return;
      }
      router.push("/login");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "box-border w-full rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-3 text-sm text-[var(--text-heading-soft)] transition-colors";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--app-bg)] px-6 py-8 transition-colors duration-200">
      <div className="absolute right-4 top-4 z-10 md:right-8 md:top-8">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-xl transition-colors duration-200 dark:shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
        <div className="border-b border-[var(--app-border)] px-7 pb-6 pt-8 text-center">
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
            Create account
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
            {error && (
              <div
                role="alert"
                className="rounded-[10px] border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-[13px] text-red-600 dark:text-red-400"
              >
                {error}
              </div>
            )}

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">Name</span>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Full name"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">Role</span>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "RECRUITER" | "HIRING_MANAGER")}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="RECRUITER">Recruiter</option>
                <option value="HIRING_MANAGER">Hiring Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">Email</span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">Password</span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-[var(--text-body)]">Confirm Password</span>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Repeat password"
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full cursor-pointer rounded-[10px] border-none bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-3.5 text-sm font-semibold text-white opacity-100 shadow-[0_4px_14px_rgba(59,130,246,0.35)] transition-opacity disabled:cursor-not-allowed disabled:opacity-80"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="mt-6 border-t border-[var(--app-border)] pt-6 text-center text-[13px] text-[var(--text-muted)]">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-blue-600 no-underline dark:text-blue-400">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
