"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ProfileCard from "@/components/profile/ProfileCard";
import { T } from "@/lib/helpers";

function roleLabel(role) {
  if (role === "HIRING_MANAGER") return "Hiring manager";
  if (role === "RECRUITER") return "Recruiter";
  if (role === "ADMIN") return "Admin";
  return role || "—";
}

export default function UserProfileViewPage() {
  const params = useParams();
  const userId = useMemo(() => (params?.id ? String(params.id) : ""), [params]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    setLoading(true);
    setError("");
    fetch(`/api/users/${encodeURIComponent(userId)}/profile`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = body?.message || body?.error || `Request failed (${res.status})`;
          throw new Error(msg);
        }
        return body;
      })
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="w-full min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-500" style={T.mono}>
            Directory
          </p>
          <h1 className="m-0 font-['Fraunces',serif] text-2xl font-extrabold text-[var(--text-heading)]">
            User profile
          </h1>
        </div>
        <Link href="/users" className="no-underline">
          <Button variant="ghost" sm>
            ← Back to users
          </Button>
        </Link>
      </div>

      {loading ? (
        <p style={{ ...T.mono, color: "var(--text-muted)" }} className="m-0 text-sm">
          Loading profile…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-600 backdrop-blur-md dark:text-red-300"
        >
          {error}
        </div>
      ) : profile ? (
        <div className="space-y-6">
          <ProfileCard profile={profile} showStrength={false} />
          <Card glass style={{ padding: "18px 22px" }}>
            <p className="m-0 text-sm text-[var(--text-muted)]">
              Viewing is role-scoped. Contact fields are only included when allowed.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="min-w-0">
                <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]" style={T.mono}>
                  Role
                </p>
                <p className="m-0 mt-1 text-sm text-[var(--text-heading)]">{roleLabel(profile.role)}</p>
              </div>
              <div className="min-w-0">
                <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]" style={T.mono}>
                  Sign-in email
                </p>
                <p className="m-0 mt-1 break-all text-sm text-[var(--text-heading)]">{profile.email}</p>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card glass style={{ padding: "18px 22px" }}>
          <p className="m-0 text-sm text-[var(--text-muted)]">Profile not found.</p>
        </Card>
      )}
    </div>
  );
}

