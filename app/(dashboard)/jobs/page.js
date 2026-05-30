"use client";

import { useCallback, useEffect, useState } from "react";
import Jobs from "@/components/pages/Jobs";
import { JOBS_LIST_REFRESH_EVENT } from "@/src/lib/applicants-refresh-event";

/** Map `GET /api/jobs` row to `Jobs` card shape (mock-compatible). */
function apiJobToUi(j) {
  const m = j && typeof j.jobMeta === "object" && j.jobMeta != null ? j.jobMeta : {};
  const salaryMin = typeof m.salaryMin === "number" ? m.salaryMin : null;
  const salaryMax = typeof m.salaryMax === "number" ? m.salaryMax : null;
  const currency = typeof m.currency === "string" ? m.currency : "";
  const salary =
    salaryMin != null || salaryMax != null
      ? `${currency ? `${currency} ` : ""}${salaryMin ?? "?"}${salaryMax != null ? ` - ${salaryMax}` : "+"}`
      : "";
  const st = j.status === "OPEN" ? "Open" : j.status === "PAUSED" ? "Paused" : "Closed";
  const posted = j.createdAt ? String(j.createdAt).slice(0, 10) : "";
  return {
    id: j.id,
    title: j.title,
    dept: j.department,
    loc: j.location,
    openings: Number.isInteger(m.numberOfOpenings) ? m.numberOfOpenings : 1,
    employmentType: typeof m.employmentType === "string" ? m.employmentType : "",
    salary,
    posted,
    status: st,
    applicantCount: j.applicantCount,
    hiredCount: j.hiredCount,
    jobMeta: m,
  };
}

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [error, setError] = useState(null);

  const refreshJobs = useCallback(async () => {
    const res = await fetch("/api/jobs?limit=100", { credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.message || body?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    const rows = Array.isArray(body.data) ? body.data.map(apiJobToUi) : [];
    setJobs(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setError(null);
    refreshJobs()
      .then(() => {
        if (!cancelled) setLoadState("ok");
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadState("error");
          setError(e instanceof Error ? e.message : "Failed to load jobs");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshJobs]);

  useEffect(() => {
    const onRefresh = () => {
      void refreshJobs();
    };
    window.addEventListener(JOBS_LIST_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(JOBS_LIST_REFRESH_EVENT, onRefresh);
  }, [refreshJobs]);

  if (loadState === "loading") {
    return <p style={{ fontFamily: "'DM Mono',monospace", color: "#64748B" }}>Loading jobs…</p>;
  }
  if (loadState === "error" && error) {
    return (
      <div
        role="alert"
        style={{
          padding: "14px 18px",
          borderRadius: 8,
          background: "rgba(248,113,113,.12)",
          border: "1px solid rgba(248,113,113,.4)",
          color: "#FCA5A5",
          fontFamily: "'DM Mono',monospace",
          fontSize: 12,
        }}
      >
        {error}
      </div>
    );
  }

  return <Jobs jobs={jobs} setJobs={setJobs} applicants={[]} refreshJobs={refreshJobs} />;
}
