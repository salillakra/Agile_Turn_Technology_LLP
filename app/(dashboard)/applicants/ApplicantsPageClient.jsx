"use client";

import { useCallback, useEffect, useState } from "react";
import Applicants from "@/components/pages/Applicants";
import { mapApplicationsApiRowToApplicantItem } from "@/src/lib/applications-drilldown-ui";
import { T } from "@/lib/helpers";

async function readJsonSafe(res) {
  return res.json().catch(() => ({}));
}

export default function ApplicantsPageClient() {
  const [jobs, setJobs] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoadState("loading");
    setError("");

    const [jobsRes, appsRes] = await Promise.all([
      fetch("/api/jobs?limit=100", { credentials: "same-origin" }),
      fetch("/api/applications?limit=100", { credentials: "same-origin" }),
    ]);

    const [jobsBody, appsBody] = await Promise.all([readJsonSafe(jobsRes), readJsonSafe(appsRes)]);

    if (!jobsRes.ok) {
      throw new Error(jobsBody?.message || jobsBody?.error || `Failed to load jobs (${jobsRes.status})`);
    }
    if (!appsRes.ok) {
      throw new Error(appsBody?.message || appsBody?.error || `Failed to load applications (${appsRes.status})`);
    }

    const jobsRows = Array.isArray(jobsBody?.data) ? jobsBody.data : [];
    const appsRows = Array.isArray(appsBody?.data) ? appsBody.data : [];

    setJobs(jobsRows);
    setApplicants(appsRows.map(mapApplicationsApiRowToApplicantItem));
    setLoadState("ok");
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh().catch((e) => {
      if (!cancelled) {
        setLoadState("error");
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  if (loadState === "loading") {
    return (
      <p style={{ ...T.mono, color: "var(--text-muted)" }} className="m-0 text-sm">
        Loading applicants…
      </p>
    );
  }
  if (loadState === "error") {
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
        {error || "Failed to load applicants"}
      </div>
    );
  }

  return <Applicants applicants={applicants} setApplicants={setApplicants} jobs={jobs} onRefresh={refresh} />;
}
