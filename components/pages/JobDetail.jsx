"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T } from "@/lib/helpers";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import JobRecommendedCandidates from "@/components/JobRecommendedCandidates";
import JobCandidateScores from "@/components/JobCandidateScores";
import InterviewTimeline from "@/components/InterviewTimeline";

function apiJobToUi(j) {
  const m = j && typeof j.jobMeta === "object" && j.jobMeta != null ? j.jobMeta : {};
  const salaryMin = typeof m.salaryMin === "number" ? m.salaryMin : null;
  const salaryMax = typeof m.salaryMax === "number" ? m.salaryMax : null;
  const currency = typeof m.currency === "string" ? m.currency : "";
  const salary =
    salaryMin != null || salaryMax != null
      ? `${currency ? `${currency} ` : ""}${salaryMin ?? "?"}${salaryMax != null ? ` - ${salaryMax}` : ""}`
      : "";
  const st = j.status === "OPEN" ? "Open" : j.status === "PAUSED" ? "Paused" : "Closed";
  return {
    id: j.id,
    title: j.title,
    dept: j.department,
    loc: j.location,
    employmentType: typeof m.employmentType === "string" ? m.employmentType : "",
    salary,
    status: st,
    statusApi: j.status,
    applicantCount: j.applicantCount ?? 0,
    hiredCount: j.hiredCount ?? 0,
    jobMeta: m,
    description: j.description,
    yearsOfExperience: j.yearsOfExperience,
    requiredSkills: Array.isArray(j.requiredSkills) ? j.requiredSkills : [],
  };
}

/**
 * @param {object} props
 * @param {string} props.jobId
 */
export default function JobDetail({ jobId }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recRefreshKey, setRecRefreshKey] = useState(0);

  const loadJob = useCallback(async () => {
    if (!jobId) {
      setError("Missing job id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Failed to load job (${res.status})`);
      }
      setJob(apiJobToUi(body));
    } catch (e) {
      setJob(null);
      setError(e instanceof Error ? e.message : "Failed to load job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  if (loading) {
    return (
      <p style={{ ...T.mono, color: "var(--text-muted)", fontSize: 12 }}>Loading job…</p>
    );
  }

  if (error || !job) {
    return (
      <div>
        <Link
          href="/jobs"
          style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
        >
          ← Back to jobs
        </Link>
        <p style={{ marginTop: 16, color: "#FCA5A5", fontSize: 13 }} role="alert">
          {error || "Job not found"}
        </p>
      </div>
    );
  }

  const statusColor =
    job.status === "Open" ? "#34D399" : job.status === "Paused" ? "#FBBF24" : "#F87171";
  const statusBg =
    job.status === "Open"
      ? "rgba(52,211,153,.1)"
      : job.status === "Paused"
        ? "rgba(251,191,36,.1)"
        : "rgba(248,113,113,.1)";

  const requiredSkills =
    job.requiredSkills?.length > 0
      ? job.requiredSkills
      : Array.isArray(job.jobMeta?.requiredSkills)
        ? job.jobMeta.requiredSkills
        : [];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/jobs"
          style={{
            fontSize: 12,
            color: "var(--accent)",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Back to jobs
        </Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <p
          style={{
            ...T.mono,
            margin: "0 0 4px",
            color: "#3B82F6",
            textTransform: "uppercase",
            letterSpacing: ".1em",
          }}
        >
          Job detail
        </p>
        <h1 style={T.h1}>{job.title}</h1>
      </div>

      <Card style={{ padding: "20px 22px", marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Badge label={job.status} color={statusColor} bg={statusBg} />
          <span style={{ ...T.mono, fontSize: 11 }}>
            {job.dept} · {job.loc}
            {job.employmentType ? ` · ${job.employmentType}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: "#60A5FA",
                fontFamily: "'Fraunces',serif",
              }}
            >
              {job.applicantCount}
            </p>
            <p style={{ ...T.mono, margin: 0, fontSize: 9 }}>APPLICANTS</p>
          </div>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: "#34D399",
                fontFamily: "'Fraunces',serif",
              }}
            >
              {job.hiredCount}
            </p>
            <p style={{ ...T.mono, margin: 0, fontSize: 9 }}>HIRED</p>
          </div>
        </div>
        {job.description ? (
          <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.55, color: "var(--text-body)" }}>
            {job.description}
          </p>
        ) : null}
        {requiredSkills.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {requiredSkills.map((skill) => (
              <span
                key={skill}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "rgba(96,165,250,.12)",
                  color: "#93C5FD",
                  border: "1px solid rgba(96,165,250,.25)",
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link href={`/applicants?jobId=${encodeURIComponent(job.id)}`}>
            <Button sm variant="ghost">
              View applicants
            </Button>
          </Link>
          <Link href={`/kanban`}>
            <Button sm variant="ghost">
              Open pipeline
            </Button>
          </Link>
          <Link href={`/apply/${job.id}`} target="_blank" rel="noopener noreferrer">
            <Button sm variant="ghost">
              Apply link
            </Button>
          </Link>
        </div>
      </Card>

      <Card style={{ padding: "18px 22px" }}>
        <JobRecommendedCandidates
          jobId={job.id}
          jobStatus={job.status}
          enabled
          refreshKey={recRefreshKey}
          onPipelineChange={() => {
            setRecRefreshKey((k) => k + 1);
            void loadJob();
          }}
        />
      </Card>

      <Card style={{ padding: "18px 22px", marginTop: 16 }}>
        <InterviewTimeline jobId={job.id} enabled showCandidate />
      </Card>

      <Card style={{ padding: "18px 22px", marginTop: 16 }}>
        <JobCandidateScores
          jobId={job.id}
          jobStatus={job.status}
          enabled
          refreshKey={recRefreshKey}
          onPipelineChange={() => {
            setRecRefreshKey((k) => k + 1);
            void loadJob();
          }}
        />
      </Card>
    </div>
  );
}
