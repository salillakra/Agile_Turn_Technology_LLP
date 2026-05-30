"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import ResumeCandidateModal from "@/components/ResumeCandidateModal";
import { T } from "@/lib/helpers";
import { canCreateCandidate, canReadResume, canViewCandidates } from "@/src/lib/rbac";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/components/NotificationBell";
import { dispatchPipelineDataRefresh } from "@/src/lib/applicants-refresh-event";
import RecruiterSearchQueryInput from "@/components/RecruiterSearchQueryInput";
import { RECRUITER_SEARCH_SUGGESTIONS } from "@/src/lib/ai/recruiter-search-suggestions";
import { trackRecruiterSearchClick } from "@/lib/recruiter-search-analytics-client";

const FEATURED_SUGGESTIONS = RECRUITER_SEARCH_SUGGESTIONS.slice(0, 6).map((s) => s.text);

function formatScore(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function displayReason(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "Semantic match — review profile for fit.";
  const first = text.split(/(?<=[.!?])\s+/)[0]?.trim();
  return (first || text).replace(/\.$/, "");
}

function formatBatchSummary(body) {
  const created = typeof body?.created === "number" ? body.created : 0;
  const skippedDuplicates =
    typeof body?.skippedDuplicates === "number" ? body.skippedDuplicates : 0;
  const parts = [];
  if (created > 0) {
    parts.push(created === 1 ? "1 added to pipeline" : `${created} added to pipeline`);
  }
  if (skippedDuplicates > 0) {
    parts.push(
      skippedDuplicates === 1
        ? "1 already on pipeline"
        : `${skippedDuplicates} already on pipeline`
    );
  }
  return parts.length ? parts.join(" · ") + "." : "No changes.";
}

export default function RecruiterAiSearch() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canView = canViewCandidates(role);
  const canApply = canCreateCandidate(role);
  const canViewResume = canReadResume(role);

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchId, setSearchId] = useState("");
  const [results, setResults] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobPicker, setJobPicker] = useState({
    open: false,
    candidateIds: [],
    mode: "pipeline",
  });
  const [selectedJobId, setSelectedJobId] = useState("");
  const [pipelineBusy, setPipelineBusy] = useState(false);

  const [sessionShortlist, setSessionShortlist] = useState(() => new Set());
  const [busyCandidateId, setBusyCandidateId] = useState("");

  const [resumeModal, setResumeModal] = useState({
    open: false,
    candidateId: undefined,
    name: "",
  });

  const openJobs = useMemo(
    () => jobs.filter((j) => j.status === "OPEN" || j.status === "Open"),
    [jobs]
  );

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await fetch("/api/jobs?limit=100&status=OPEN", {
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error("Failed to load jobs");
      const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      setJobs(
        rows
          .filter((j) => j && typeof j.id === "string")
          .map((j) => ({
            id: j.id,
            title: j.title ?? "Untitled job",
            status:
              j.status === "OPEN"
                ? "Open"
                : j.status === "PAUSED"
                  ? "Paused"
                  : j.status ?? "Open",
          }))
      );
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canApply) void loadJobs();
  }, [canApply, loadJobs]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/search/analytics?days=30", {
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body && typeof body === "object") {
        setAnalytics(body);
      }
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void loadAnalytics();
  }, [canView, loadAnalytics]);

  function logResultImpressions(id, rows) {
    if (!id) return;
    rows.forEach((row, index) => {
      trackRecruiterSearchClick({
        searchId: id,
        candidateId: row.candidateId,
        clickType: "RESULT_IMPRESSION",
        finalScore: row.finalScore,
        semanticScore: row.semanticScore,
        rankPosition: index,
      });
    });
  }

  async function runSearch(searchText) {
    const q = (searchText ?? query).trim();
    if (!q) {
      setError("Enter a search query.");
      return;
    }
    setLoading(true);
    setError("");
    setActionMsg("");
    setSubmittedQuery(q);
    try {
      const res = await fetch("/api/search/candidates", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body && typeof body === "object" && "message" in body && typeof body.message === "string"
            ? body.message
            : body && typeof body === "object" && "error" in body && typeof body.error === "string"
              ? body.error
              : `Search failed (${res.status})`;
        throw new Error(msg);
      }
      const payload =
        body && typeof body === "object" && Array.isArray(body.results) ? body : null;
      const legacyRows = Array.isArray(body) ? body : [];
      const rows = payload?.results ?? legacyRows;
      const nextSearchId =
        payload && typeof payload.searchId === "string" ? payload.searchId : "";
      const filtered = rows.filter(
        (r) =>
          r &&
          typeof r === "object" &&
          typeof r.candidateId === "string" &&
          typeof r.candidateName === "string"
      );
      setSearchId(nextSearchId);
      setResults(filtered);
      logResultImpressions(nextSearchId, filtered);
      void loadAnalytics();
    } catch (e) {
      setResults([]);
      setSearchId("");
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleSessionShortlist(candidateId) {
    setSessionShortlist((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function openJobPicker(candidateIds, mode = "pipeline") {
    if (!canApply || candidateIds.length === 0) return;
    setSelectedJobId(openJobs[0]?.id ?? "");
    setJobPicker({ open: true, candidateIds, mode });
  }

  async function applyToJob() {
    if (!selectedJobId || jobPicker.candidateIds.length === 0) return;
    setPipelineBusy(true);
    setError("");
    setActionMsg("");
    try {
      const recommendedCandidates = results
        .filter((r) => jobPicker.candidateIds.includes(r.candidateId))
        .map((r) => ({
          candidateId: r.candidateId,
          candidateName: r.candidateName,
          finalScore: r.finalScore,
        }));

      const res = await fetch(
        `/api/jobs/${encodeURIComponent(selectedJobId)}/applications/batch`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateIds: jobPicker.candidateIds,
            recommendedCandidates,
            ...(searchId ? { recruiterSearchId: searchId } : {}),
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Apply failed (${res.status})`);
      }
      setActionMsg(formatBatchSummary(body));
      setJobPicker({ open: false, candidateIds: [], mode: "pipeline" });
      if (jobPicker.mode === "shortlist") {
        setSessionShortlist((prev) => {
          const next = new Set(prev);
          for (const id of jobPicker.candidateIds) next.delete(id);
          return next;
        });
      }
      dispatchPipelineDataRefresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add to pipeline");
    } finally {
      setPipelineBusy(false);
      setBusyCandidateId("");
    }
  }

  function handleAddToPipeline(candidateId, row) {
    if (searchId) {
      trackRecruiterSearchClick({
        searchId,
        candidateId,
        clickType: "ADD_PIPELINE",
        finalScore: row?.finalScore,
        semanticScore: row?.semanticScore,
      });
    }
    setBusyCandidateId(candidateId);
    openJobPicker([candidateId], "pipeline");
  }

  function handleShortlist(candidateId, row) {
    if (searchId) {
      trackRecruiterSearchClick({
        searchId,
        candidateId,
        clickType: "SHORTLIST",
        finalScore: row?.finalScore,
        semanticScore: row?.semanticScore,
      });
    }
    toggleSessionShortlist(candidateId);
    setActionMsg("Added to session shortlist. Pick a job to add to pipeline.");
  }

  function handleViewProfile(row) {
    if (searchId) {
      trackRecruiterSearchClick({
        searchId,
        candidateId: row.candidateId,
        clickType: "VIEW_PROFILE",
        finalScore: row.finalScore,
        semanticScore: row.semanticScore,
      });
    }
    setResumeModal({
      open: true,
      candidateId: row.candidateId,
      name: row.candidateName,
    });
  }

  if (!canView) {
    return (
      <p style={{ ...T.body, color: "var(--text-muted)" }}>
        You do not have permission to search candidates.
      </p>
    );
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <header style={{ marginBottom: 24 }}>
        <p
          style={{
            margin: "0 0 6px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            fontFamily: "'DM Mono',monospace",
          }}
        >
          AI search
        </p>
        <h1 style={T.h1}>Recruiter semantic search</h1>
        <p style={{ ...T.body, marginTop: 8, maxWidth: 640, lineHeight: 1.55 }}>
          Describe who you need in plain language. Results combine semantic similarity with
          skills, experience, and location signals.
        </p>
      </header>

      {analytics && !analyticsLoading ? (
        <section
          aria-label="Search analytics (30 days)"
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid var(--app-border)",
            background: "rgba(148,163,184,.06)",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontFamily: "'DM Mono',monospace",
            }}
          >
            Search analytics · 30 days
            {analytics.scope === "user" ? " (your searches)" : ""}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {[
              { label: "Success rate", value: `${analytics.searchSuccessRate ?? 0}%` },
              { label: "Shortlist conversion", value: `${analytics.searchToShortlistConversionRate ?? 0}%` },
              { label: "Result clicks", value: String(analytics.clickedRecommendations ?? 0) },
              { label: "Total searches", value: String(analytics.totalSearches ?? 0) },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--app-surface)",
                  border: "1px solid var(--app-border)",
                }}
              >
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
                  {stat.value}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
          {Array.isArray(analytics.mostSearchedSkills) &&
          analytics.mostSearchedSkills.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "var(--text-muted)" }}>
                Most searched skills
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {analytics.mostSearchedSkills.slice(0, 8).map((item) => (
                  <span
                    key={item.skill}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "rgba(99,102,241,.1)",
                      color: "#A5B4FC",
                    }}
                  >
                    {item.skill} ({item.searchCount})
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <Field label="Natural language query">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <RecruiterSearchQueryInput
            value={query}
            onChange={setQuery}
            disabled={loading}
            placeholder='Start typing or pick a suggestion — e.g. "Find React developers"'
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 10,
              alignItems: "center",
            }}
          >
            <button
              type="submit"
              disabled={loading}
              style={{
                background: "#3B82F6",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: loading ? "default" : "pointer",
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 600,
                fontSize: 13,
                padding: "8px 16px",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Searching…" : "Search"}
            </button>
            {sessionShortlist.size > 0 && canApply ? (
              <Button
                variant="ghost"
                sm
                disabled={pipelineBusy}
                onClick={() =>
                  openJobPicker([...sessionShortlist], "shortlist")
                }
              >
                Add {sessionShortlist.size} shortlisted to job
              </Button>
            ) : null}
          </div>
        </form>

        <p
          style={{
            margin: "10px 0 6px",
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "'DM Mono',monospace",
          }}
        >
          Suggested searches
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FEATURED_SUGGESTIONS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                void runSearch(example);
              }}
              style={{
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--app-border)",
                background: "rgba(148,163,184,.08)",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </Field>

      {error ? (
        <p style={{ margin: "16px 0", fontSize: 13, color: "#F87171" }} role="alert">
          {error}
        </p>
      ) : null}
      {actionMsg ? (
        <p style={{ margin: "12px 0", fontSize: 13, color: "#86EFAC" }}>{actionMsg}</p>
      ) : null}

      {submittedQuery && !loading ? (
        <p
          style={{
            margin: "20px 0 10px",
            fontSize: 12,
            color: "var(--text-muted)",
            fontFamily: "'DM Mono',monospace",
          }}
        >
          {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{submittedQuery}
          &rdquo;
        </p>
      ) : null}

      {loading ? (
        <p style={{ fontFamily: "'DM Mono',monospace", color: "var(--text-muted)" }}>
          Generating embedding and ranking candidates…
        </p>
      ) : null}

      {!loading && results.length > 0 ? (
        <div
          style={{
            border: "1px solid var(--app-border)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--app-surface)",
          }}
        >
          {results.map((row, index) => {
            const finalScore = formatScore(row.finalScore);
            const semanticScore = formatScore(row.semanticScore);
            const reason = displayReason(row.recommendationReason);
            const skills = Array.isArray(row.skills) ? row.skills.slice(0, 8) : [];
            const shortlisted = sessionShortlist.has(row.candidateId);
            const busy = busyCandidateId === row.candidateId;

            return (
              <div
                key={row.candidateId}
                style={{
                  padding: "14px 16px",
                  borderTop: index === 0 ? "none" : "1px solid rgba(148,163,184,.12)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: "6px 10px",
                  }}
                >
                  <strong style={{ fontSize: 15, color: "var(--text-heading-soft)" }}>
                    {row.candidateName}
                  </strong>
                  {row.currentDesignation ? (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {row.currentDesignation}
                    </span>
                  ) : null}
                  {finalScore != null ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--accent)",
                      }}
                      title="Hybrid final score"
                    >
                      {finalScore}% match
                    </span>
                  ) : null}
                  {semanticScore != null ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(99,102,241,.12)",
                        color: "#A5B4FC",
                        border: "1px solid rgba(99,102,241,.2)",
                      }}
                      title="Semantic similarity"
                    >
                      Semantic {semanticScore}%
                    </span>
                  ) : null}
                </div>

                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "var(--text-body)",
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{reason}&rdquo;
                </p>

                {skills.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 8,
                    }}
                  >
                    {skills.map((skill) => (
                      <span
                        key={`${row.candidateId}-${skill}`}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "rgba(134,239,172,.1)",
                          color: "#86EFAC",
                          border: "1px solid rgba(134,239,172,.22)",
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 12,
                    alignItems: "center",
                  }}
                >
                  {canViewResume ? (
                    <Button
                      sm
                      variant="ghost"
                      disabled={busy || pipelineBusy}
                              onClick={() => handleViewProfile(row)}
                    >
                      View profile
                    </Button>
                  ) : (
                    <Link
                      href={`/applicants?candidateId=${encodeURIComponent(row.candidateId)}`}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--accent)",
                        textDecoration: "none",
                      }}
                    >
                      View profile
                    </Link>
                  )}
                  {canApply ? (
                    <>
                      <Button
                        sm
                        disabled={busy || pipelineBusy || openJobs.length === 0}
                              onClick={() => handleAddToPipeline(row.candidateId, row)}
                      >
                        {busy ? "Applying…" : "Add to pipeline"}
                      </Button>
                      <Button
                        sm
                        variant={shortlisted ? "success" : "ghost"}
                        disabled={pipelineBusy}
                              onClick={() => handleShortlist(row.candidateId, row)}
                      >
                        {shortlisted ? "Shortlisted" : "Shortlist"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && submittedQuery && results.length === 0 && !error ? (
        <p style={{ ...T.body, color: "var(--text-muted)", marginTop: 16 }}>
          No matching candidates. Try broadening your query or ensure profiles have embeddings.
        </p>
      ) : null}

      <Modal
        open={jobPicker.open}
        onClose={() =>
          !pipelineBusy &&
          setJobPicker({ open: false, candidateIds: [], mode: "pipeline" })
        }
        title={
          jobPicker.mode === "shortlist"
            ? "Add shortlisted candidates to job"
            : "Add to job pipeline"
        }
      >
        <Field label="Open job">
          <Select
            value={selectedJobId}
            onChange={(val) => setSelectedJobId(val)}
            disabled={jobsLoading || pipelineBusy || openJobs.length === 0}
            options={
              openJobs.length === 0
                ? [{ value: "", label: "No open jobs" }]
                : openJobs.map((j) => ({ value: j.id, label: j.title }))
            }
          />
        </Field>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "12px 0 0" }}>
          {jobPicker.candidateIds.length} candidate
          {jobPicker.candidateIds.length === 1 ? "" : "s"} selected.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <Button
            variant="ghost"
            disabled={pipelineBusy}
            onClick={() =>
              setJobPicker({ open: false, candidateIds: [], mode: "pipeline" })
            }
          >
            Cancel
          </Button>
          <Button
            disabled={pipelineBusy || !selectedJobId || openJobs.length === 0}
            onClick={() => void applyToJob()}
          >
            {pipelineBusy ? "Adding…" : "Confirm"}
          </Button>
        </div>
      </Modal>

      <ResumeCandidateModal
        open={resumeModal.open}
        onClose={() => setResumeModal({ open: false, candidateId: undefined, name: "" })}
        candidateId={resumeModal.candidateId}
        candidateName={resumeModal.name}
        userRole={role}
      />
    </div>
  );
}
