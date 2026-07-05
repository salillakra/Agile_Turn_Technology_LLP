"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { T } from "@/lib/helpers";
import { canCreateCandidate, canReadResume, canViewCandidates } from "@/src/lib/rbac";
import ResumeCandidateModal from "@/components/ResumeCandidateModal";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/components/NotificationBell";
import { dispatchPipelineDataRefresh } from "@/src/lib/applicants-refresh-event";

function formatScore(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function normalizeNameKey(name) {
  return typeof name === "string"
    ? name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

/** Collapse duplicate DB rows for the same person (keep highest match %). */
function dedupeRecommendedRows(rows) {
  const best = new Map();
  for (const row of rows) {
    const key = normalizeNameKey(row.candidateName) || row.candidateId;
    const prev = best.get(key);
    const score = typeof row.finalScore === "number" ? row.finalScore : 0;
    const prevScore = prev && typeof prev.finalScore === "number" ? prev.finalScore : -1;
    if (!prev || score > prevScore) {
      best.set(key, row);
    }
  }
  return [...best.values()].sort(
    (a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0)
  );
}

function displayReason(row) {
  const raw =
    typeof row.recommendationReason === "string" ? row.recommendationReason.trim() : "";
  if (!raw) return "Review fit before adding to pipeline";
  const first = raw.split(/(?<=[.!?])\s+/)[0]?.trim();
  return (first || raw).replace(/\.$/, "");
}

function formatBatchSummary(body, items) {
  const created = typeof body?.created === "number" ? body.created : 0;
  const skippedDuplicates =
    typeof body?.skippedDuplicates === "number" ? body.skippedDuplicates : 0;
  const skippedNotEligible =
    typeof body?.skippedNotEligible === "number" ? body.skippedNotEligible : 0;
  const skippedInaccessible =
    typeof body?.skippedInaccessible === "number" ? body.skippedInaccessible : 0;
  const skippedOther = typeof body?.skippedOther === "number" ? body.skippedOther : 0;
  const results = Array.isArray(body?.results) ? body.results : [];

  const nameById = new Map(
    (items ?? []).map((row) => [row.candidateId, row.candidateName])
  );

  const parts = [];
  if (created > 0) {
    parts.push(
      created === 1 ? "1 added to pipeline" : `${created} added to pipeline`
    );
  }
  if (skippedDuplicates > 0) {
    parts.push(
      skippedDuplicates === 1
        ? "1 already on pipeline"
        : `${skippedDuplicates} already on pipeline`
    );
  }
  if (skippedNotEligible > 0) {
    parts.push(
      skippedNotEligible === 1
        ? "1 not eligible (résumé/skills)"
        : `${skippedNotEligible} not eligible (résumé/skills)`
    );
  }
  if (skippedInaccessible > 0) {
    parts.push(
      skippedInaccessible === 1
        ? "1 not accessible"
        : `${skippedInaccessible} not accessible`
    );
  }
  if (skippedOther > 0) {
    parts.push(
      skippedOther === 1 ? "1 could not be added" : `${skippedOther} could not be added`
    );
  }

  const failed = results.filter((r) => r && r.status === "skipped");
  for (const row of failed) {
    const label = nameById.get(row.candidateId) || row.candidateId;
    const reason =
      row.reason === "FORBIDDEN"
        ? "no access"
        : row.reason === "NOT_FOUND"
          ? "profile missing"
          : row.reason === "JOB_NOT_OPEN"
            ? "job not open"
            : row.reason ?? "failed";
    parts.push(`${label}: ${reason}`);
  }

  return parts.length ? `${parts.join(" · ")}.` : "No candidates were added to the pipeline.";
}

function selectedRecommendationPayload(items, selected) {
  return items
    .filter((row) => selected.has(row.candidateId))
    .map((row) => ({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      finalScore: row.finalScore,
    }));
}

/**
 * @param {object} props
 * @param {string} props.jobId
 * @param {boolean} [props.enabled]
 * @param {string} [props.jobStatus]
 * @param {number} [props.refreshKey]
 * @param {() => void} [props.onPipelineChange]
 */
export default function JobRecommendedCandidates({
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
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/recommended-candidates`,
        { credentials: "same-origin" }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body && typeof body === "object" && "message" in body && typeof body.message === "string"
            ? body.message
            : body && typeof body === "object" && "error" in body && typeof body.error === "string"
              ? body.error
              : `Failed to load recommendations (${res.status})`;
        throw new Error(msg);
      }
      const rows = Array.isArray(body) ? body : [];
      setItems(
        dedupeRecommendedRows(
          rows.filter(
            (r) =>
              r &&
              typeof r === "object" &&
              typeof r.candidateId === "string" &&
              typeof r.candidateName === "string"
          )
        )
      );
      setSelected(new Set());
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load recommended candidates");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [jobId, enabled, canView]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const allSelected = useMemo(
    () => items.length > 0 && items.every((row) => selected.has(row.candidateId)),
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
    setSelected(new Set(items.map((row) => row.candidateId)));
  }

  async function shortlistSelected() {
    if (!canApply || !jobOpen || !jobId || selected.size === 0) return;
    setBatchBusy(true);
    setActionMsg("");
    setFetchError("");
    const candidateIds = [...selected];
    const recommendedCandidates = selectedRecommendationPayload(items, selected);

    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/applications/batch`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateIds,
            recommendedCandidates,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body?.message || body?.error || `Bulk shortlist failed (${res.status})`
        );
      }

      const created = typeof body?.created === "number" ? body.created : 0;
      const skippedDuplicates =
        typeof body?.skippedDuplicates === "number" ? body.skippedDuplicates : 0;

      setActionMsg(formatBatchSummary(body, items));
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

  async function applyCandidate(candidateId, candidateName) {
    if (!canApply || !jobOpen || !jobId) return;
    setBusyCandidateId(candidateId);
    setActionMsg("");
    setFetchError("");
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/applications/batch`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateIds: [candidateId],
            recommendedCandidates: selectedRecommendationPayload(
              items,
              new Set([candidateId])
            ),
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body?.message || body?.error || `Apply failed (${res.status})`
        );
      }
      const created = typeof body?.created === "number" ? body.created : 0;
      const skippedDuplicates =
        typeof body?.skippedDuplicates === "number" ? body.skippedDuplicates : 0;

      setActionMsg(formatBatchSummary(body, items));

      dispatchPipelineDataRefresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
      }
      onPipelineChange?.();
      await load();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to apply candidate");
    } finally {
      setBusyCandidateId("");
    }
  }

  if (!canView) return null;

  return (
    <>
      <Field>
        <FieldLabel className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Recommended candidates
        </FieldLabel>
        <p style={{ margin: "0 0 10px", fontSize: 11, lineHeight: 1.5, color: "var(--text-muted)" }}>
          AI-ranked talent from your pool. Select multiple candidates and shortlist in one step —
          duplicate applications are skipped automatically.
        </p>

        {loading ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            Loading recommendations…
          </p>
        ) : null}

        {fetchError ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#FCA5A5" }} role="alert">
            {fetchError}
          </p>
        ) : null}

        {!loading && items.length === 0 && !fetchError ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            No candidates met the minimum match threshold for this role.
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
                  aria-label="Select all recommended candidates"
                />
                Select all ({items.length})
              </label>
            ) : null}

            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {items.map((row) => {
                const finalScore = formatScore(row.finalScore);
                const semanticAvailable = row.semanticAvailable !== false;
                const semanticScore = semanticAvailable
                  ? formatScore(row.semanticScore)
                  : null;
                const matched = row.matchedSkills ?? [];
                const reason = displayReason(row);
                const busy = busyCandidateId === row.candidateId;
                const checked = selected.has(row.candidateId);

                return (
                  <div
                    key={row.candidateId}
                    style={{
                      borderBottom: "1px solid rgba(148,163,184,.12)",
                      padding: "12px 14px",
                      background: checked ? "rgba(99,102,241,.06)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      {canApply && jobOpen ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={batchBusy || busy}
                          onChange={() => toggleSelected(row.candidateId)}
                          style={{ marginTop: 4 }}
                          aria-label={`Select ${row.candidateName}`}
                        />
                      ) : null}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "baseline",
                            gap: "6px 10px",
                            fontSize: 14,
                            color: "var(--text-heading-soft)",
                          }}
                        >
                          <strong style={{ fontWeight: 600 }}>{row.candidateName}</strong>
                          {finalScore != null ? (
                            <>
                              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                                —
                              </span>
                              <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                                {finalScore}%
                              </span>
                            </>
                          ) : null}
                          {semanticScore != null ? (
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
                              Semantic {semanticScore}%
                            </span>
                          ) : null}
                        </div>

                        <p
                          style={{
                            margin: "6px 0 0",
                            fontSize: 12,
                            lineHeight: 1.45,
                            color: "var(--text-body)",
                            fontStyle: "italic",
                          }}
                        >
                          &ldquo;{reason}&rdquo;
                        </p>

                        {matched.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 6,
                              marginTop: 8,
                            }}
                          >
                            {matched.map((skill) => (
                              <span
                                key={`${row.candidateId}-${skill}`}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: "3px 8px",
                                  borderRadius: 999,
                                  background: "rgba(134,239,172,.12)",
                                  color: "#86EFAC",
                                  border: "1px solid rgba(134,239,172,.25)",
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
                            marginTop: 10,
                            alignItems: "center",
                          }}
                        >
                          {canViewResume ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy || batchBusy}
                              onClick={() =>
                                setResumeModal({
                                  open: true,
                                  candidateId: row.candidateId,
                                  name: row.candidateName,
                                })
                              }
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
                          {canApply && jobOpen ? (
                            <Button
                              size="sm"
                              disabled={busy || batchBusy}
                              onClick={() =>
                                void applyCandidate(row.candidateId, row.candidateName)
                              }
                            >
                              {busy ? "Applying…" : "Add to pipeline"}
                            </Button>
                          ) : null}
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
          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <Button
              size="sm"
              disabled={batchBusy || selected.size === 0}
              onClick={() => void shortlistSelected()}
            >
              {batchBusy
                ? "Shortlisting…"
                : selected.size === 0
                  ? "Shortlist selected"
                  : `Shortlist ${selected.size} candidate${selected.size === 1 ? "" : "s"}`}
            </Button>
            {selected.size > 0 ? (
              <button
                type="button"
                disabled={batchBusy}
                onClick={() => setSelected(new Set())}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: 11,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Clear selection ({selected.size})
              </button>
            ) : null}
          </div>
        ) : null}

        {actionMsg ? (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#86EFAC" }}>{actionMsg}</p>
        ) : null}
      </Field>

      <ResumeCandidateModal
        open={resumeModal.open}
        onClose={() => setResumeModal({ open: false, candidateId: undefined, name: "" })}
        candidateId={resumeModal.candidateId}
        candidateName={resumeModal.name}
        userRole={role}
      />
    </>
  );
}
