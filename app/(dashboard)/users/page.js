"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Field from "@/components/ui/Field";
import Button from "@/components/ui/Button";
import { T } from "@/lib/helpers";

function roleLabel(role) {
  if (role === "HIRING_MANAGER") return "Hiring manager";
  if (role === "RECRUITER") return "Recruiter";
  if (role === "ADMIN") return "Admin";
  return role || "—";
}

function useUsersDirectory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async ({ q, role } = {}) => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (role) sp.set("role", role);
      const res = await fetch(`/api/users/visible?${sp.toString()}`, { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.message || body?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }
      setRows(Array.isArray(body?.data) ? body.data : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  return { rows, loading, error, load };
}

export default function UsersPage() {
  const { rows, loading, error, load } = useUsersDirectory();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");

  const visibleRoleOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      if (r && typeof r.role === "string") set.add(r.role);
    }
    return Array.from(set).sort();
  }, [rows]);

  useEffect(() => {
    void load({ q: "", role: "" });
  }, [load]);

  const onSearch = useCallback(() => {
    void load({ q: q.trim(), role: role.trim() });
  }, [load, q, role]);

  return (
    <div className="w-full min-w-0">
      <div className="mb-8 w-full min-w-0 max-w-3xl">
        <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-500" style={T.mono}>
          Directory
        </p>
        <h1 className="m-0 block bg-gradient-to-br from-[var(--text-heading)] to-blue-600 bg-clip-text pb-1 font-['Fraunces',serif] text-2xl font-extrabold leading-tight text-transparent dark:to-blue-400">
          Users
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          View profiles that are visible to your role. Editing is only available from your own profile page.
        </p>
      </div>

      <Card glass className="mb-6" style={{ padding: "18px 22px" }}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 [&>*]:min-w-0">
          <Field label="Search (name or email)">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. aditya or @company.com" />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{
                width: "100%",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                borderRadius: 8,
                color: "var(--text-heading-soft)",
                fontFamily: "'DM Sans',sans-serif",
                fontSize: 13,
                padding: "8px 12px",
                outline: "none",
              }}
            >
              <option value="">All visible roles</option>
              {visibleRoleOptions.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={onSearch} disabled={loading}>
              {loading ? "Loading…" : "Search"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setQ("");
                setRole("");
                void load({ q: "", role: "" });
              }}
              disabled={loading}
            >
              Reset
            </Button>
          </div>
        </div>
        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-600 backdrop-blur-md dark:text-red-300"
          >
            {error}
          </div>
        ) : null}
      </Card>

      {loading ? (
        <p style={{ ...T.mono, color: "var(--text-muted)" }} className="m-0 text-sm">
          Loading users…
        </p>
      ) : rows.length === 0 ? (
        <Card glass style={{ padding: "18px 22px" }}>
          <p className="m-0 text-sm text-[var(--text-muted)]">No users found for your current filters.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((u) => (
            <Link
              key={u.id}
              href={`/users/${u.id}`}
              className="no-underline"
              style={{ color: "inherit" }}
            >
              <Card glass className="relative overflow-hidden" style={{ padding: "18px 22px" }}>
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" aria-hidden />
                <div className="relative flex min-w-0 items-center gap-4">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/35 bg-[var(--app-surface)] shadow-sm dark:border-white/10">
                    {u.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-[var(--text-muted)]">
                        {(u.name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate font-semibold text-[var(--text-heading)]">{u.name || "—"}</p>
                    <p className="m-0 mt-0.5 truncate text-sm text-[var(--text-muted)]">{u.email || "—"}</p>
                    <p className="m-0 mt-1 text-[11px] font-bold uppercase tracking-wider text-blue-500" style={T.mono}>
                      {roleLabel(u.role)}
                    </p>
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">View →</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

