"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { canCreateCandidate } from "@/src/lib/rbac";

/**
 * @typedef {object} RecommendationRow
 * @property {string} jobId
 * @property {string} title
 * @property {number} finalScore
 * @property {number} semanticScore
 * @property {string[]} matchedSkills
 * @property {string[]} missingSkills
 * @property {string} recommendationReason
 * @property {string} [aiRecommendationReason]
 */

function formatScore(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function resolveAiReason(row) {
  if (
    typeof row.aiRecommendationReason === "string" &&
    row.aiRecommendationReason.trim()
  ) {
    return row.aiRecommendationReason.trim();
  }
  if (
    typeof row.recommendationReason === "string" &&
    row.recommendationReason.trim()
  ) {
    const first = row.recommendationReason.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (first) return first.replace(/\.$/, "");
  }
  const skills = (row.matchedSkills ?? []).slice(0, 2);
  if (skills.length > 0) {
    return `Matched on ${skills.join(" + ")}`;
  }
  return "Review role fit before applying";
}

/**
 * Fetches ranked job recommendations and lets recruiters multi-select roles before creating applications.
 *
 * @param {object} props
 * @param {string | undefined} props.candidateId
 * @param {boolean} [props.enabled]
 * @param {number} [props.refreshKey] — increment to refetch (e.g. after parse apply)
 * @param {string | undefined} props.userRole
 * @param {(summary: { applied: number; jobIds: string[] }) => void} [props.onApplied]
 */
export default function RecommendedRolesPanel({
  candidateId,
  enabled = true,
  refreshKey = 0,
  userRole,
  onApplied,
}) {
  const canApply = canCreateCandidate(userRole);

  /** @type {[RecommendationRow[], Function]} */
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");

  const load = useCallback(async () => {
    if (!candidateId || !enabled) return;
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch(
        `/api/candidates/${encodeURIComponent(candidateId)}/recommendations`,
        {
          credentials: "same-origin",
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : body &&
                typeof body === "object" &&
                "error" in body &&
                typeof body.error === "string"
              ? body.error
              : `Failed to load recommendations (${res.status})`;
        throw new Error(msg);
      }
      const rows = Array.isArray(body) ? body : [];
      setItems(
        rows.filter(
          (r) =>
            r &&
            typeof r === "object" &&
            typeof r.jobId === "string" &&
            typeof r.title === "string",
        ),
      );
      setSelected(new Set());
    } catch (e) {
      setFetchError(
        e instanceof Error ? e.message : "Failed to load recommendations",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [candidateId, enabled]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const allSelected = useMemo(
    () => items.length > 0 && items.every((row) => selected.has(row.jobId)),
    [items, selected],
  );

  function toggleSelected(jobId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((row) => row.jobId)));
  }

  async function applyToSelected() {
    if (!candidateId || selected.size === 0 || !canApply) return;
    setApplyBusy(true);
    setApplyMsg("");
    setFetchError("");
    const jobIds = [...selected];

    try {
      const res = await fetch(
        `/api/candidates/${encodeURIComponent(candidateId)}/applications/batch`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobIds,
            recommendedJobs: items.map((row) => ({
              jobId: row.jobId,
              title: row.title,
              matchScore: row.finalScore,
            })),
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body?.message || body?.error || `Batch apply failed (${res.status})`,
        );
      }

      const created = typeof body?.created === "number" ? body.created : 0;
      const skippedDuplicates =
        typeof body?.skippedDuplicates === "number"
          ? body.skippedDuplicates
          : 0;

      const parts = [];
      if (created > 0) {
        parts.push(
          created === 1
            ? "1 application created"
            : `${created} applications created`,
        );
      }
      if (skippedDuplicates > 0) {
        parts.push(
          skippedDuplicates === 1
            ? "1 duplicate skipped"
            : `${skippedDuplicates} duplicates skipped`,
        );
      }
      setApplyMsg(
        parts.length ? `${parts.join(" · ")}.` : "No new applications created.",
      );

      if (created > 0) {
        setSelected(new Set());
        onApplied?.({ applied: created, jobIds });
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Batch apply failed");
    } finally {
      setApplyBusy(false);
    }
  }

  if (!enabled || !candidateId) return null;

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: "1px solid rgba(148,163,184,.2)",
      }}
    >
      <Field>
        <FieldLabel className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Recommended roles
        </FieldLabel>
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 11,
            lineHeight: 1.5,
            color: "var(--text-muted)",
          }}
        >
          AI-ranked open roles from the resume profile. Select one or more, then
          apply in bulk — nothing is submitted until you confirm.
        </p>

        {loading ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            Loading recommendations…
          </p>
        ) : null}

        {fetchError ? (
          <p
            style={{ margin: "8px 0 0", fontSize: 12, color: "#FCA5A5" }}
            role="alert"
          >
            {fetchError}
          </p>
        ) : null}

        {!loading && items.length === 0 && !fetchError ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            No open roles met the minimum match threshold.
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
            {canApply ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: "1px solid rgba(148,163,184,.18)",
                  background: "rgba(148,163,184,.06)",
                  cursor: applyBusy ? "default" : "pointer",
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
                  disabled={applyBusy}
                  onChange={toggleSelectAll}
                  aria-label="Select all recommended roles"
                />
                Select all ({items.length})
              </label>
            ) : null}

            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {items.map((row) => {
                const checked = selected.has(row.jobId);
                const finalScore = formatScore(
                  row.finalScore ?? row.matchScore,
                );
                const semanticScore = formatScore(row.semanticScore);
                const semanticAvailable = row.semanticAvailable === true;
                const aiReason = resolveAiReason(row);
                const matched = row.matchedSkills ?? [];

                return (
                  <div
                    key={row.jobId}
                    style={{
                      borderBottom: "1px solid rgba(148,163,184,.12)",
                      padding: "12px",
                      background: checked
                        ? "rgba(99,102,241,.06)"
                        : "transparent",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        cursor: canApply ? "pointer" : "default",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canApply || applyBusy}
                        onChange={() => toggleSelected(row.jobId)}
                        style={{ marginTop: 4 }}
                        aria-label={`Select ${row.title}`}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
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
                          <strong style={{ fontWeight: 600 }}>
                            {row.title}
                          </strong>
                          {finalScore != null ? (
                            <>
                              <span
                                style={{
                                  color: "var(--text-muted)",
                                  fontWeight: 500,
                                }}
                              >
                                —
                              </span>
                              <span
                                style={{
                                  color: "var(--accent)",
                                  fontWeight: 700,
                                }}
                              >
                                {finalScore}%
                              </span>
                            </>
                          ) : null}
                          {semanticAvailable && semanticScore != null ? (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: 999,
                                background: "rgba(148,163,184,.14)",
                                color: "var(--text-muted)",
                                letterSpacing: "0.02em",
                              }}
                              title="Semantic similarity score"
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
                          &ldquo;{aiReason}&rdquo;
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
                                key={`${row.jobId}-${skill}`}
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
                        ) : (
                          <p
                            style={{
                              margin: "8px 0 0",
                              fontSize: 11,
                              color: "var(--text-muted)",
                            }}
                          >
                            No explicit skill overlap recorded
                          </p>
                        )}

                        {row.missingSkills?.length ? (
                          <p
                            style={{
                              margin: "6px 0 0",
                              fontSize: 10,
                              color: "var(--text-muted)",
                            }}
                          >
                            Gaps: {row.missingSkills.slice(0, 4).join(", ")}
                            {row.missingSkills.length > 4 ? "…" : ""}
                          </p>
                        ) : null}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {applyMsg ? (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#86EFAC" }}>
            {applyMsg}
          </p>
        ) : null}

        {canApply && items.length > 0 ? (
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
              disabled={applyBusy || selected.size === 0}
              onClick={() => void applyToSelected()}
            >
              {applyBusy
                ? "Applying…"
                : selected.size === 0
                  ? "Apply to selected roles"
                  : `Apply to ${selected.size} selected role${selected.size === 1 ? "" : "s"}`}
            </Button>
            {selected.size > 0 ? (
              <button
                type="button"
                disabled={applyBusy}
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
      </Field>
    </div>
  );
}
