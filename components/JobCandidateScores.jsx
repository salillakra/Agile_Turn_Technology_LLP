"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { T } from "@/lib/helpers";
import { canCreateCandidate, canReadResume, canViewCandidates } from "@/src/lib/rbac";
import ResumeCandidateModal from "@/components/ResumeCandidateModal";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/components/NotificationBell";
import { dispatchPipelineDataRefresh } from "@/src/lib/applicants-refresh-event";

function roundScore(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function priorityTier(score) {
  const s = typeof score === "number" && Number.isFinite(score) ? score : 0;
  if (s >= 90) return "Excellent Match";
  if (s >= 75) return "Strong Match";
  if (s >= 60) return "Moderate Match";
  return "Weak Match";
}

function tierStyles(tier) {
  if (tier === "Excellent Match") {
    return { color: "#34D399", bg: "rgba(52,211,153,.10)", border: "rgba(52,211,153,.22)" };
  }
  if (tier === "Strong Match") {
    return { color: "#60A5FA", bg: "rgba(96,165,250,.10)", border: "rgba(96,165,250,.22)" };
  }
  if (tier === "Moderate Match") {
    return { color: "#FBBF24", bg: "rgba(251,191,36,.10)", border: "rgba(251,191,36,.22)" };
  }
  return { color: "#FCA5A5", bg: "rgba(248,113,113,.10)", border: "rgba(248,113,113,.22)" };
}

function dedupeByCandidateId(rows) {
  const best = new Map();
  for (const row of rows) {
    const id = row?.candidate?.id;
    if (typeof id !== "string") continue;
    const prev = best.get(id);
    const score = typeof row?.candidateFitScore === "number" ? row.candidateFitScore : 0;
    const prevScore = prev && typeof prev.candidateFitScore === "number" ? prev.candidateFitScore : -1;
    if (!prev || score > prevScore) best.set(id, row);
  }
  return [...best.values()].sort((a, b) => (b.candidateFitScore ?? 0) - (a.candidateFitScore ?? 0));
}

async function postInteraction(jobId, payload) {
  if (!jobId) return;
  try {
    await fetch(`/api/jobs/${encodeURIComponent(jobId)}/candidate-scores/event`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // non-blocking
  }
}

function selectedPayload(items, selected) {
  return items
    .filter((row) => selected.has(row.candidate.id))
    .map((row) => ({
      candidateId: row.candidate.id,
      candidateName: row.candidate.candidateName,
      finalScore: row.candidateFitScore,
    }));
}

/**
 * AI candidate scoring UI for a job (calls GET /api/jobs/[id]/candidate-scores).
 */
export default function JobCandidateScores({
  jobId,
  enabled = true,
  jobStatus = "Open",
  refreshKey = 0,
  onPipelineChange,
}) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canView = canViewCandidates(role);
  const canApply = canCreateCandidate(role);
  const canViewResume = canReadResume(role);
  const jobOpen = jobStatus === "Open" || jobStatus === "OPEN";

  const [items, setItems] = useState([]);
  const [thresholds, setThresholds] = useState({
    minimumAcceptableScore: 60,
    highPriorityThreshold: 75,
    autoShortlistThreshold: 90,
  });
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [busyCandidateId, setBusyCandidateId] = useState("");
  const [resumeModal, setResumeModal] = useState({
    open: false,
    candidateId: undefined,
    name: "",
  });

  const load = useCallback(async () => {
    if (!jobId || !enabled || !canView) return;
    setLoading(true);
    setFetchError("");
    setActionMsg("");
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/candidate-scores?limit=120`,
        { credentials: "same-origin" }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body && typeof body === "object" && "message" in body && typeof body.message === "string"
            ? body.message
            : body && typeof body === "object" && "error" in body && typeof body.error === "string"
              ? body.error
              : `Failed to load candidate scores (${res.status})`;
        throw new Error(msg);
      }
      const rows = Array.isArray(body) ? body : [];
      const normalized = rows.filter((r) => r && typeof r === "object" && r.candidate && r.candidate.id);
      const deduped = dedupeByCandidateId(normalized);
      setItems(deduped);
      setSelected(new Set());

      const minAcceptable = Number(res.headers.get("X-Candidate-Score-Min-Acceptable"));
      const highPriority = Number(res.headers.get("X-Candidate-Score-High-Priority"));
      const autoShortlist = Number(res.headers.get("X-Candidate-Score-Auto-Shortlist"));
      setThresholds((prev) => ({
        minimumAcceptableScore: Number.isFinite(minAcceptable) ? minAcceptable : prev.minimumAcceptableScore,
        highPriorityThreshold: Number.isFinite(highPriority) ? highPriority : prev.highPriorityThreshold,
        autoShortlistThreshold: Number.isFinite(autoShortlist) ? autoShortlist : prev.autoShortlistThreshold,
      }));

      // Log impressions for top ranked rows (signals \"ignored\" later when no follow-up action).
      for (let i = 0; i < Math.min(deduped.length, 25); i += 1) {
        const row = deduped[i];
        void postInteraction(jobId, {
          interactionType: "RESULT_IMPRESSION",
          candidateId: row.candidate.id,
          candidateFitScore: row.candidateFitScore,
          semanticScore: row.semanticScore,
          rankPosition: i,
        });
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load candidate scores");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [jobId, enabled, canView]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const allSelected = useMemo(
    () => items.length > 0 && items.every((row) => selected.has(row.candidate.id)),
    [items, selected]
  );

  function toggleSelected(candidateId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((row) => row.candidate.id)));
  }

  async function shortlistSelected() {
    if (!canApply || !jobOpen || !jobId || selected.size === 0) return;
    setBatchBusy(true);
    setFetchError("");
    setActionMsg("");
    const candidateIds = [...selected];
    const recommendedCandidates = selectedPayload(items, selected);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/applications/batch`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds, recommendedCandidates }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Bulk shortlist failed (${res.status})`);
      }
      setActionMsg("Selected candidates added to pipeline.");

      // Track shortlist interaction for optimization.
      for (let i = 0; i < items.length; i += 1) {
        const row = items[i];
        if (selected.has(row.candidate.id)) {
          void postInteraction(jobId, {
            interactionType: "SHORTLIST",
            candidateId: row.candidate.id,
            candidateFitScore: row.candidateFitScore,
            semanticScore: row.semanticScore,
            rankPosition: i,
          });
        }
      }

      setSelected(new Set());
      dispatchPipelineDataRefresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
      }
      onPipelineChange?.();
      await load();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Bulk shortlist failed");
    } finally {
      setBatchBusy(false);
    }
  }

  async function applyCandidate(candidateId) {
    if (!canApply || !jobOpen || !jobId) return;
    setBusyCandidateId(candidateId);
    setFetchError("");
    setActionMsg("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/applications/batch`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: [candidateId],
          recommendedCandidates: selectedPayload(items, new Set([candidateId])),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Add to pipeline failed (${res.status})`);
      }
      setActionMsg("Candidate added to pipeline.");
      const idx = items.findIndex((r) => r?.candidate?.id === candidateId);
      void postInteraction(jobId, {
        interactionType: "ADD_PIPELINE",
        candidateId,
        candidateFitScore: idx >= 0 ? items[idx]?.candidateFitScore : undefined,
        semanticScore: idx >= 0 ? items[idx]?.semanticScore : undefined,
        rankPosition: idx >= 0 ? idx : undefined,
      });
      dispatchPipelineDataRefresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
      }
      onPipelineChange?.();
      await load();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to add candidate");
    } finally {
      setBusyCandidateId("");
    }
  }

  if (!canView) return null;

  return (
    <>
      <Field label="AI candidate scoring">
        <p style={{ margin: "0 0 10px", fontSize: 11, lineHeight: 1.5, color: "var(--text-muted)" }}>
          Ranked candidates with explainable fit reasons. Use tiers to prioritize review and shortlist
          high-signal profiles quickly.
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 10, ...T.mono, color: "var(--text-muted)" }}>
          Thresholds: min acceptable {thresholds.minimumAcceptableScore} · high priority {thresholds.highPriorityThreshold}
          · auto-shortlist {thresholds.autoShortlistThreshold} (future)
        </p>

        {loading ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Loading scores…</p>
        ) : null}

        {fetchError ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#FCA5A5" }} role="alert">
            {fetchError}
          </p>
        ) : null}

        {actionMsg ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#A7F3D0" }} role="status">
            {actionMsg}
          </p>
        ) : null}

        {!loading && items.length === 0 && !fetchError ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            No scored candidates available for this job scope.
          </p>
        ) : null}

        {items.length > 0 ? (
          <div
            style={{
              borderRadius: 8,
              border: "1px solid var(--app-border-strong)",
              background: "var(--app-card)",
              overflow: "hidden",
            }}
          >
            {canApply && jobOpen ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: "1px solid rgba(148,163,184,.18)",
                  background: "rgba(148,163,184,.06)",
                  cursor: batchBusy ? "default" : "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={batchBusy}
                  onChange={toggleSelectAll}
                  aria-label="Select all scored candidates"
                />
                Select all ({items.length})
              </label>
            ) : null}

            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {items.map((row) => {
                const id = row.candidate.id;
                const fitScore = roundScore(row.candidateFitScore);
                const semantic = roundScore(row.semanticScore);
                const tier = priorityTier(row.candidateFitScore);
                const tierStyle = tierStyles(tier);
                const matched = Array.isArray(row.matchedSkills) ? row.matchedSkills : [];
                const reasons = Array.isArray(row.recommendationReasons) ? row.recommendationReasons : [];
                const busy = busyCandidateId === id;
                const checked = selected.has(id);

                return (
                  <div
                    key={id}
                    style={{
                      borderBottom: "1px solid rgba(148,163,184,.12)",
                      padding: "12px 14px",
                      background: checked ? "rgba(99,102,241,.06)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      {canApply && jobOpen ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={batchBusy || busy}
                          onChange={() => toggleSelected(id)}
                          style={{ marginTop: 6 }}
                          aria-label={`Select ${row.candidate.candidateName}`}
                        />
                      ) : null}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontWeight: 650, color: "var(--text-heading-soft)" }}>
                            {row.candidate.candidateName}
                          </strong>

                          {fitScore != null ? (
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: "var(--accent)",
                              }}
                              title="Candidate fit score"
                            >
                              {fitScore}
                            </span>
                          ) : null}

                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: tierStyle.bg,
                              color: tierStyle.color,
                              border: `1px solid ${tierStyle.border}`,
                              textTransform: "uppercase",
                              letterSpacing: ".05em",
                            }}
                            title="Recruiter prioritization tier"
                          >
                            {tier}
                          </span>

                          {semantic != null ? (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: 999,
                                background: "rgba(148,163,184,.14)",
                                color: "var(--text-muted)",
                              }}
                              title="Semantic similarity"
                            >
                              Semantic {semantic}
                            </span>
                          ) : null}
                        </div>

                        {reasons.length > 0 ? (
                          <div style={{ marginTop: 8 }}>
                            <p style={{ ...T.mono, margin: "0 0 6px", fontSize: 9, color: "var(--text-muted)" }}>
                              WHY THIS MATCH
                            </p>
                            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.45, color: "var(--text-body)" }}>
                              {reasons.slice(0, 4).map((r) => (
                                <li key={`${id}-${r}`}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {matched.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                            {matched.slice(0, 10).map((skill) => (
                              <span
                                key={`${id}-${skill}`}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 650,
                                  padding: "3px 8px",
                                  borderRadius: 999,
                                  background: "rgba(99,102,241,.10)",
                                  border: "1px solid rgba(99,102,241,.22)",
                                  color: "#C7D2FE",
                                }}
                                title="Matched skill"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                          {canViewResume ? (
                            <Button
                              sm
                              variant="ghost"
                              disabled={busy || batchBusy}
                              onClick={() =>
                                setResumeModal({
                                  open: true,
                                  candidateId: id,
                                  name: row.candidate.candidateName,
                                })
                              }
                            >
                              View profile
                            </Button>
                          ) : (
                            <Link
                              href={`/applicants?candidateId=${encodeURIComponent(id)}`}
                              style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
                            >
                              View profile
                            </Link>
                          )}

                          <Button
                            sm
                            variant="ghost"
                            disabled={busy || batchBusy}
                            onClick={() => {
                              void postInteraction(jobId, {
                                interactionType: "VIEW_PROFILE",
                                candidateId: id,
                                candidateFitScore: row.candidateFitScore,
                                semanticScore: row.semanticScore,
                              });
                              setResumeModal({
                                open: true,
                                candidateId: id,
                                name: row.candidate.candidateName,
                              });
                            }}
                            style={{ display: canViewResume ? "none" : undefined }}
                          >
                            View profile (log)
                          </Button>

                          {canApply && jobOpen ? (
                            <Button sm disabled={busy || batchBusy} onClick={() => void applyCandidate(id)}>
                              {busy ? "Adding…" : "Add to pipeline"}
                            </Button>
                          ) : null}

                          <Button
                            sm
                            variant="ghost"
                            disabled={busy || batchBusy}
                            onClick={() => {
                              void postInteraction(jobId, {
                                interactionType: "IGNORED",
                                candidateId: id,
                                candidateFitScore: row.candidateFitScore,
                                semanticScore: row.semanticScore,
                              });
                              setItems((prev) => prev.filter((x) => x.candidate.id !== id));
                              setSelected((prev) => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                              });
                            }}
                            title="Dismiss without rejecting (feedback signal)"
                          >
                            Ignore
                          </Button>

                          <Button
                            sm
                            variant="ghost"
                            disabled={busy || batchBusy}
                            onClick={() => {
                              void postInteraction(jobId, {
                                interactionType: "REJECTED",
                                candidateId: id,
                                candidateFitScore: row.candidateFitScore,
                                semanticScore: row.semanticScore,
                              });
                              setItems((prev) => prev.filter((x) => x.candidate.id !== id));
                              setSelected((prev) => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                              });
                            }}
                            title="Mark as not a fit (strong negative feedback)"
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {canApply && jobOpen && items.length > 0 ? (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Button sm disabled={batchBusy || selected.size === 0} onClick={() => void shortlistSelected()}>
              {batchBusy ? "Shortlisting…" : selected.size === 0 ? "Shortlist selected" : `Shortlist selected (${selected.size})`}
            </Button>
            <Button sm variant="ghost" disabled={loading || batchBusy} onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <Button sm variant="ghost" disabled={loading} onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        )}
      </Field>

      <ResumeCandidateModal
        open={resumeModal.open}
        candidateId={resumeModal.candidateId}
        name={resumeModal.name}
        onClose={() => setResumeModal({ open: false, candidateId: undefined, name: "" })}
      />
    </>
  );
}

