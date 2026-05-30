"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { canEditCandidate, canReadResume, canUploadResume } from "@/src/lib/rbac";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Field from "@/components/ui/Field";
import RecommendedRolesPanel from "@/components/RecommendedRolesPanel";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/components/NotificationBell";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string | undefined} props.candidateId — CUID; modal is inert without it
 * @param {string | undefined} props.userRole — session role for RBAC display
 * @param {string | undefined} props.candidateName — label only
 */
export default function ResumeCandidateModal({ open, onClose, candidateId, userRole, candidateName }) {
  const canUpload = canUploadResume(userRole);
  const canRead = canReadResume(userRole);
  const canApplyParse = canEditCandidate(userRole);

  const [loading, setLoading] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [parseStatus, setParseStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [applyName, setApplyName] = useState("");
  const [applySkills, setApplySkills] = useState("");
  const [applyYears, setApplyYears] = useState("0");
  const [applySummary, setApplySummary] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyOk, setApplyOk] = useState(null);
  const [recommendationsRefreshKey, setRecommendationsRefreshKey] = useState(0);
  const [showRawJson, setShowRawJson] = useState(false);

  const load = useCallback(async () => {
    if (!candidateId || !open) return;
    setLoading(true);
    setErr(null);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/candidates/${candidateId}`, { credentials: "same-origin" }),
        fetch(`/api/candidates/${candidateId}/parse-status`, { credentials: "same-origin" }),
      ]);
      const cBody = await cRes.json().catch(() => ({}));
      if (!cRes.ok) {
        const msg = typeof cBody?.message === "string" ? cBody.message : cBody?.error;
        throw new Error(msg || `Failed to load candidate (${cRes.status})`);
      }
      setCandidate(cBody);
      const pBody = await pRes.json().catch(() => ({}));
      if (pRes.ok) setParseStatus(pBody);
      else setParseStatus(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [candidateId, open]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) setShowRawJson(false);
  }, [open]);

  const resumeUrl = candidate && typeof candidate.resumeUrl === "string" ? candidate.resumeUrl.trim() : "";
  const resumeFileName =
    candidate && typeof candidate.resumeFileName === "string" ? candidate.resumeFileName.trim() : "";

  async function handleDownload() {
    if (!candidateId) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/resume`, { credentials: "same-origin" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || j?.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      let filename = resumeFileName || "resume";
      const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd);
      if (m?.[1]) {
        try {
          filename = decodeURIComponent(m[1].replace(/^"|"$/g, ""));
        } catch {
          filename = m[1].replace(/^"|"$/g, "");
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !candidateId) return;
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/candidates/${candidateId}/resume`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Upload failed (${res.status})`);
      }
      setCandidate(body);
      const pRes = await fetch(`/api/candidates/${candidateId}/parse-status`, { credentials: "same-origin" });
      const pBody = await pRes.json().catch(() => ({}));
      if (pRes.ok) setParseStatus(pBody);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const refreshParseStatus = useCallback(async () => {
    if (!candidateId) return;
    try {
      const pRes = await fetch(`/api/candidates/${candidateId}/parse-status`, { credentials: "same-origin" });
      const pBody = await pRes.json().catch(() => ({}));
      if (pRes.ok) setParseStatus(pBody);
    } catch {
      // Polling must not surface as unhandled rejection (network / abort).
    }
  }, [candidateId]);

  async function handleParse(options = { force: false }) {
    if (!candidateId) return;
    setErr(null);
    setBusy(true);
    try {
      const q = options.force ? "?force=1" : "";
      const res = await fetch(`/api/candidates/${candidateId}/resume/parse${q}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Parse request failed (${res.status})`);
      }
      await refreshParseStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open || !candidateId) return;
    if (parseStatus?.status !== "PENDING" && parseStatus?.status !== "PROCESSING") return;
    const t = setInterval(() => {
      void refreshParseStatus();
    }, 2500);
    return () => clearInterval(t);
  }, [open, candidateId, parseStatus?.status, refreshParseStatus]);

  useEffect(() => {
    const r = parseStatus?.result;
    if (parseStatus?.status !== "COMPLETED" || r == null || typeof r !== "object") return;
    setApplyName(typeof r.name === "string" ? r.name : "");
    setApplySkills(Array.isArray(r.skills) ? r.skills.join(", ") : "");
    const y = r.experience?.years;
    setApplyYears(typeof y === "number" && Number.isFinite(y) ? String(y) : "0");
    setApplySummary(typeof r.experience?.summary === "string" ? r.experience.summary : "");
    setApplyOk(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseStatus?.resumeParseJobId, parseStatus?.status]);

  async function handleApplyParsedToProfile() {
    if (!candidateId || !parseStatus?.resumeParseJobId) return;
    setErr(null);
    setApplyOk(null);
    setApplyBusy(true);
    try {
      const years = parseFloat(applyYears);
      const skills = applySkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`/api/candidates/${candidateId}/resume/parse/apply`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeParseJobId: parseStatus.resumeParseJobId,
          result: {
            name: applyName.trim(),
            skills,
            experience: {
              years: Number.isFinite(years) ? years : 0,
              summary: applySummary,
            },
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Apply failed (${res.status})`);
      }
      setCandidate(body);
      setApplyOk("Candidate profile updated from this parse.");
      setRecommendationsRefreshKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplyBusy(false);
    }
  }

  const parseLabel =
    parseStatus?.status == null
      ? "—"
      : parseStatus.status === "COMPLETED"
        ? "Done"
        : parseStatus.status === "FAILED"
          ? "Failed"
          : parseStatus.status === "PROCESSING"
            ? "Processing"
            : "Pending";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={candidateName ? `Résumé — ${candidateName}` : "Résumé"}
    >
      {!candidateId && (
        <p style={{ color: "var(--text-body)", fontSize: 13, margin: 0 }}>
          No candidate id for this row (local-only entry). Résumé actions require a saved application from the server.
        </p>
      )}
      {candidateId && (
        <>
          {loading && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</p>}
          {err && (
            <div
              role="alert"
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(248,113,113,.12)",
                border: "1px solid rgba(248,113,113,.35)",
                color: "#FCA5A5",
                fontSize: 12,
              }}
            >
              {err}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-heading-soft)" }}>
              <strong style={{ color: "var(--text-heading-soft)" }}>File on record:</strong>{" "}
              {resumeUrl ? resumeFileName || "Uploaded" : "None"}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {canRead && resumeUrl ? (
                <Button sm variant="ghost" disabled={busy} onClick={() => void handleDownload()}>
                  Download
                </Button>
              ) : null}
              {canUpload ? (
                <label style={{ cursor: busy ? "not-allowed" : "pointer" }}>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: "none" }}
                    disabled={busy}
                    onChange={(e) => void handleUpload(e)}
                  />
                  <span
                    style={{
                      display: "inline-block",
                      padding: "6px 12px",
                      borderRadius: 8,
                      background: "rgba(59,130,246,.2)",
                      border: "1px solid rgba(59,130,246,.45)",
                      color: "var(--accent)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {busy ? "Working…" : "Upload / replace"}
                  </span>
                </label>
              ) : null}
              {canUpload && resumeUrl ? (
                <>
                  <Button sm disabled={busy} onClick={() => void handleParse({ force: false })}>
                    Run parse job
                  </Button>
                  <Button sm variant="ghost" disabled={busy} onClick={() => void handleParse({ force: true })} title="Enqueue a new job even if this file was parsed before (e.g. after parser upgrade)">
                    Re-parse (ignore cache)
                  </Button>
                </>
              ) : null}
            </div>

            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--app-card)",
                border: "1px solid var(--app-border-strong)",
                fontSize: 12,
                color: "var(--text-body)",
              }}
            >
              <div>
                <strong style={{ color: "var(--text-heading-soft)" }}>Parse status:</strong> {parseLabel}
              </div>
              {parseStatus?.status === "PENDING" || parseStatus?.status === "PROCESSING" ? (
                <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.45, color: "var(--text-muted)" }}>
                  Jobs stay pending until the parse worker runs (e.g. scheduled cron every ~5 min, or manual
                  call to <code style={{ color: "var(--text-body)" }}>/api/cron/process-parse-jobs</code> with{" "}
                  <code style={{ color: "var(--text-body)" }}>CRON_SECRET</code>).
                </p>
              ) : null}
              {parseStatus?.error ? (
                <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", color: "#FCA5A5" }}>{parseStatus.error}</pre>
              ) : null}
              {parseStatus?.status === "COMPLETED" && parseStatus?.result != null ? (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowRawJson((v) => !v)}
                    style={{
                      background: "rgba(148,163,184,.15)",
                      border: "1px solid rgba(148,163,184,.3)",
                      borderRadius: 8,
                      color: "var(--text-body)",
                      fontSize: 11,
                      padding: "4px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {showRawJson ? "Hide raw JSON" : "Show raw JSON"}
                  </button>
                  {showRawJson ? (
                    <pre
                      style={{
                        margin: "8px 0 0",
                        whiteSpace: "pre-wrap",
                        fontSize: 11,
                        maxHeight: 180,
                        overflow: "auto",
                        color: "var(--text-heading-soft)",
                      }}
                    >
                      {JSON.stringify(parseStatus.result, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
              {parseStatus?.status === "COMPLETED" && parseStatus?.result != null && canApplyParse ? (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: "1px solid rgba(148,163,184,.2)",
                  }}
                >
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text-body)", fontWeight: 600 }}>
                    Review &amp; apply to candidate profile
                  </p>
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: "var(--text-muted)",
                    }}
                  >
                    <strong style={{ color: "var(--text-body)" }}>Saved on confirm:</strong> candidate name, total &amp; relevant
                    experience (years), and skills. The experience summary below is for review only and is{" "}
                    <strong>not</strong> stored as a separate profile field — edit the form, then confirm.
                  </p>
                  <div style={{ display: "grid", gap: 10 }}>
                    <Field label="Name">
                      <Input value={applyName} onChange={(e) => setApplyName(e.target.value)} placeholder="Full name" />
                    </Field>
                    <Field label="Experience (years)">
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={applyYears}
                        onChange={(e) => setApplyYears(e.target.value)}
                      />
                    </Field>
                    <Field label="Skills (comma-separated)">
                      <Textarea
                        value={applySkills}
                        onChange={(e) => setApplySkills(e.target.value)}
                        rows={3}
                        maxLength={18000}
                        placeholder="e.g. TypeScript, PostgreSQL (up to 60 skills, 300 chars each)"
                      />
                    </Field>
                    <Field label="Experience summary">
                      <Textarea
                        value={applySummary}
                        onChange={(e) => setApplySummary(e.target.value)}
                        rows={6}
                        maxLength={1200}
                        placeholder="Ends with a full stop when saved (max 1200 characters)"
                      />
                    </Field>
                  </div>
                  {applyOk ? (
                    <p style={{ margin: "10px 0 0", fontSize: 12, color: "#86EFAC" }}>{applyOk}</p>
                  ) : null}
                  <div style={{ marginTop: 12 }}>
                    <Button sm disabled={applyBusy || !parseStatus?.resumeParseJobId} onClick={() => void handleApplyParsedToProfile()}>
                      {applyBusy ? "Saving…" : "Confirm & apply to profile"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {parseStatus?.status === "COMPLETED" && canApplyParse && !applyOk && recommendationsRefreshKey === 0 ? (
                <p style={{ margin: "12px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--text-muted)" }}>
                  After you confirm &amp; apply the parsed profile, recommended open roles will appear here.
                </p>
              ) : null}
              {parseStatus?.status === "COMPLETED" && (applyOk || recommendationsRefreshKey > 0) ? (
                <RecommendedRolesPanel
                  candidateId={candidateId}
                  enabled
                  refreshKey={recommendationsRefreshKey}
                  userRole={userRole}
                  onApplied={() => {
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
                    }
                  }}
                />
              ) : null}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
