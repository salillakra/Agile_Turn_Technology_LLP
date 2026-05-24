"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { mapApplicationsApiRowToApplicantItem } from "@/src/lib/applications-drilldown-ui";
import { T, C, rnd, uid } from "@/lib/helpers";
import { STAGES, SOURCES, STAGE_META, STAGE_LABEL_TO_API, SOURCE_LABEL_TO_API } from "@/data/mockData";
import { canCreateCandidate, canEditCandidate, canDeleteCandidate, canReadResume } from "@/src/lib/rbac";
import ResumeCandidateModal from "@/components/ResumeCandidateModal";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/components/NotificationBell";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import StageBadge from "@/components/ui/StageBadge";
import StarRating from "@/components/ui/StarRating";
import Textarea from "@/components/ui/Textarea";
import { motion } from "framer-motion";

export default function Applicants({ applicants, setApplicants, jobs, onRefresh }) {
  const searchParams = useSearchParams();
  const stageQ = searchParams.get("stage")?.trim() || "";
  const sourceQ = searchParams.get("source")?.trim() || "";
  const jobQ = searchParams.get("jobId")?.trim() || "";
  /** Deep links from in-app notifications (`NotificationBell` → `/applicants?applicationId=` \| `?candidateId=`). */
  const applicationQ = searchParams.get("applicationId")?.trim() || "";
  const candidateQ = searchParams.get("candidateId")?.trim() || "";
  const deepLinkTarget = applicationQ || candidateQ;
  const [drillDownRows, setDrillDownRows] = useState(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownErr, setDrillDownErr] = useState(null);

  const drillDeps = useMemo(() => [stageQ, sourceQ, jobQ].join("|"), [stageQ, sourceQ, jobQ]);

  useEffect(() => {
    if (!stageQ && !sourceQ && !jobQ) {
      setDrillDownRows(null);
      setDrillDownErr(null);
      return;
    }
    const q = new URLSearchParams();
    if (stageQ) q.set("stage", stageQ);
    if (sourceQ) q.set("source", sourceQ);
    if (jobQ) q.set("jobId", jobQ);
    q.set("limit", "100");
    setDrillDownLoading(true);
    setDrillDownErr(null);
    fetch(`/api/applications?${q.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setDrillDownErr(body?.message || `Request failed (${res.status})`);
          setDrillDownRows([]);
          return;
        }
        const raw = Array.isArray(body.data) ? body.data : [];
        setDrillDownRows(raw.map(mapApplicationsApiRowToApplicantItem));
      })
      .catch(() => {
        setDrillDownErr("Network error");
        setDrillDownRows([]);
      })
      .finally(() => setDrillDownLoading(false));
  }, [drillDeps, stageQ, sourceQ, jobQ]);

  const { data: session } = useSession();
  const role = session?.user?.role;
  const allowCreate = canCreateCandidate(role);
  const allowEdit = canEditCandidate(role);
  const allowDelete = canDeleteCandidate(role);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState("");
  const [fJob, setFJob] = useState("");
  const [fStage, setFStage] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", jobId: jobs[0]?.id || "", source: "LinkedIn", stage: "Applied", rating: 3, notes: "", tags: "" });
  const f = (v) => Object.assign({}, form, v);
  const [resumeModal, setResumeModal] = useState({ open: false, candidateId: undefined, name: "" });
  const [saveError, setSaveError] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [matchState, setMatchState] = useState({ status: "idle", score: null, msg: "" });
  const [draftCandidateId, setDraftCandidateId] = useState("");
  const resumeInputRef = useRef(null);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const openAdd = () => {
    setEdit(null);
    setForm({ name: "", email: "", phone: "", jobId: jobs[0]?.id || "", source: "LinkedIn", stage: "Applied", rating: 3, notes: "", tags: "", appliedDate: new Date().toISOString().split("T")[0], lastActivity: new Date().toISOString().split("T")[0], ttFill: rnd(14, 75) });
    setResumeFile(null);
    setMatchState({ status: "idle", score: null, msg: "" });
    setDraftCandidateId("");
    if (resumeInputRef.current) resumeInputRef.current.value = "";
    setModal(true);
  };
  const openEdit = (a) => { setEdit(a); setForm({ ...a, tags: Array.isArray(a.tags) ? a.tags.join(", ") : (a.tags || "") }); setModal(true); };

  const computeMatchForNewCandidate = async (candidateId, jobId) => {
    setMatchState({ status: "working", score: null, msg: "Uploading résumé & parsing…" });

    if (!resumeFile) {
      throw new Error("Please select a résumé file before saving.");
    }

    // Upload resume
    const fd = new FormData();
    fd.set("file", resumeFile);
    const uploadRes = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/resume`, {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    });
    const uploadBody = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      throw new Error(uploadBody?.message || uploadBody?.error || `Resume upload failed (${uploadRes.status})`);
    }

    // Enqueue parse
    const parseRes = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/resume/parse`, {
      method: "POST",
      credentials: "same-origin",
    });
    const parseBody = await parseRes.json().catch(() => ({}));
    if (!parseRes.ok) {
      throw new Error(parseBody?.message || parseBody?.error || `Parse enqueue failed (${parseRes.status})`);
    }

    // Poll parse status until DONE/FAILED (max ~60s)
    const startedAt = Date.now();
    let delay = 800;
    let latest = null;
    while (Date.now() - startedAt < 60_000) {
      const stRes = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/parse-status`, {
        credentials: "same-origin",
      });
      const stBody = await stRes.json().catch(() => ({}));
      if (!stRes.ok) {
        throw new Error(stBody?.message || stBody?.error || `Parse status failed (${stRes.status})`);
      }
      latest = stBody;
      const status = stBody?.status;
      if (status === "DONE" || status === "FAILED") break;
      setMatchState({ status: "working", score: null, msg: `Parsing résumé… (${String(status || "PENDING")})` });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
      delay = Math.min(5000, Math.round(delay * 1.4));
    }
    if (!latest || latest.status !== "DONE") {
      const msg = latest?.status === "FAILED" ? String(latest?.error || "Parse failed") : "Parse did not complete in time.";
      throw new Error(msg);
    }

    // Apply parse output to candidate skills (required by eligibility rule)
    setMatchState({ status: "working", score: null, msg: "Applying parsed skills…" });
    const applyRes = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/resume/parse/apply`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeParseJobId: latest.resumeParseJobId,
        result: latest.result,
      }),
    });
    const applyBody = await applyRes.json().catch(() => ({}));
    if (!applyRes.ok) {
      throw new Error(applyBody?.message || applyBody?.error || `Apply parse failed (${applyRes.status})`);
    }

    // Score match / eligibility
    setMatchState({ status: "working", score: null, msg: "Computing match score…" });
    const scoreRes = await fetch(
      `/api/jobs/${encodeURIComponent(jobId)}/resume-match?candidateId=${encodeURIComponent(candidateId)}`,
      { credentials: "same-origin" }
    );
    const scoreBody = await scoreRes.json().catch(() => ({}));
    if (!scoreRes.ok) {
      throw new Error(scoreBody?.message || scoreBody?.error || `Score failed (${scoreRes.status})`);
    }

    setMatchState({
      status: scoreBody?.eligible === true ? "eligible" : "blocked",
      score: scoreBody,
      msg: scoreBody?.eligible === true ? "Eligible — you can apply." : "Not eligible for this role.",
    });
    return scoreBody;
  };

  const jobForSelected = useMemo(() => jobs.find((j) => j.id === form.jobId), [jobs, form.jobId]);
  const jobMetaForSelected =
    jobForSelected && jobForSelected.jobMeta && typeof jobForSelected.jobMeta === "object" && !Array.isArray(jobForSelected.jobMeta)
      ? jobForSelected.jobMeta
      : null;
  const thresholdForSelected =
    jobMetaForSelected?.resumeMatchThreshold === null || jobMetaForSelected?.resumeMatchThreshold === undefined || jobMetaForSelected?.resumeMatchThreshold === ""
      ? null
      : Number(jobMetaForSelected.resumeMatchThreshold);
  const requiredSkillsCountForSelected = Array.isArray(jobMetaForSelected?.requiredSkills) ? jobMetaForSelected.requiredSkills.length : 0;
  const thresholdIsConfigured =
    thresholdForSelected != null && Number.isFinite(thresholdForSelected) && thresholdForSelected > 0 && requiredSkillsCountForSelected > 0;

  const parseAndMatchNow = async () => {
    setSaveError("");
    if (!form.name || !form.email || !form.phone || !form.jobId) {
      setSaveError("Name, email, phone, and position are required before parsing.");
      return;
    }
    if (!resumeFile) {
      setSaveError("Please select a résumé file.");
      return;
    }
    setSaveLoading(true);
    try {
      let candidateId = draftCandidateId;
      if (!candidateId) {
        const candidateRes = await fetch("/api/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            candidateName: form.name.trim(),
            email: form.email.trim(),
            contactNumber: form.phone?.trim() || "",
            candidateSource: SOURCE_LABEL_TO_API[form.source] ?? "OTHER",
          }),
        });
        const candidateBody = await candidateRes.json().catch(() => ({}));
        if (!candidateRes.ok) {
          throw new Error(candidateBody?.message || candidateBody?.error || `Candidate create failed (${candidateRes.status})`);
        }
        candidateId = candidateBody.id;
        setDraftCandidateId(candidateId);
      }

      const score = await computeMatchForNewCandidate(candidateId, form.jobId);
      if (score?.eligible !== true) {
        // Keep modal open; allow user to change resume and re-run.
        setSaveError("Not eligible for this role.");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Resume parse/match failed");
    } finally {
      setSaveLoading(false);
    }
  };

  const save = async () => {
    if (!form.name || !form.jobId) return;
    setSaveError("");
    setSaveLoading(true);

    try {
      if (edit) {
        setApplicants((prev) => prev.map((a) => (a.id === edit.id ? { ...a, ...form, tags: (form.tags || "").split(",").map((t) => t.trim()).filter(Boolean) } : a)));
        setModal(false);
        return;
      }

      let candidateId = draftCandidateId;
      if (!candidateId) {
        const candidateRes = await fetch("/api/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            candidateName: form.name.trim(),
            email: form.email.trim(),
            contactNumber: form.phone?.trim() || "",
            candidateSource: SOURCE_LABEL_TO_API[form.source] ?? "OTHER",
          }),
        });
        const candidateBody = await candidateRes.json().catch(() => ({}));
        if (!candidateRes.ok) {
          throw new Error(candidateBody?.message || candidateBody?.error || `Candidate create failed (${candidateRes.status})`);
        }
        candidateId = candidateBody.id;
        setDraftCandidateId(candidateId);
      }

      // If the selected job has a resume match threshold configured, enforce: upload -> parse DONE -> apply -> score.
      if (thresholdIsConfigured) {
        if (matchState?.score?.eligible !== true) {
          throw new Error("Please parse résumé & compute match before saving.");
        }
      }

      const stageApi = STAGE_LABEL_TO_API[form.stage] ?? "APPLIED";
      const appRes = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          candidateId,
          jobId: form.jobId,
          stage: stageApi,
          source: SOURCE_LABEL_TO_API[form.source] ?? null,
          rating: typeof form.rating === "number" ? form.rating : null,
          notes: form.notes?.trim() || null,
        }),
      });
      const appBody = await appRes.json().catch(() => ({}));
      if (!appRes.ok) {
        throw new Error(appBody?.message || appBody?.error || `Application create failed (${appRes.status})`);
      }

      setModal(false);
      setDraftCandidateId("");
      if (typeof onRefresh === "function") await onRefresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveLoading(false);
    }
  };

  const del = async (application) => {
    if (!application || !application.id) return;
    if (!allowDelete) return;
    setDeleteError("");

    setDeleteLoadingId(application.id);
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(application.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawnReason: "Removed from pipeline" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || `Remove failed (${res.status})`);
      }

      // Optimistic UI update, then refresh server-backed list.
      setApplicants((prev) => prev.filter((a) => a.id !== application.id));
      if (typeof onRefresh === "function") await onRefresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setDeleteLoadingId("");
    }
  };

  /** Prefer full list when opening a notification link so the pipeline row exists (drill-down may omit it). */
  const baseApplicants = deepLinkTarget ? applicants : drillDownRows !== null ? drillDownRows : applicants;
  const list = baseApplicants.filter((a) => {
    const matchQ = !q || a.name.toLowerCase().includes(q.toLowerCase()) || (a.email && a.email.toLowerCase().includes(q.toLowerCase()));
    const matchJob = !fJob || a.jobId === fJob;
    const matchStage = !fStage || a.stage === fStage;
    return matchQ && matchJob && matchStage;
  });

  useEffect(() => {
    if (!deepLinkTarget || list.length === 0) return;
    const selector = applicationQ
      ? `[data-application-id="${applicationQ.replace(/"/g, '\\"')}"]`
      : `[data-candidate-id="${candidateQ.replace(/"/g, '\\"')}"]`;
    const el = typeof document !== "undefined" ? document.querySelector(selector) : null;
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }, [deepLinkTarget, applicationQ, candidateQ, list, applicants, drillDownRows]);

  return (
    <div>
      {(stageQ || sourceQ || jobQ) && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(59,130,246,.12)",
            border: "1px solid rgba(59,130,246,.35)",
            ...T.mono,
            fontSize: 11,
            color: "var(--accent)",
          }}
        >
          {drillDownLoading && <span>Loading applications from dashboard drill-down…</span>}
          {!drillDownLoading && drillDownErr && <span style={{ color: "#FCA5A5" }}>{drillDownErr}</span>}
          {!drillDownLoading && !drillDownErr && (
            <span>
              Filtered from analytics:{" "}
              {stageQ ? `stage=${stageQ}` : ""}
              {stageQ && (sourceQ || jobQ) ? " · " : ""}
              {sourceQ ? `source=${sourceQ}` : ""}
              {(stageQ || sourceQ) && jobQ ? " · " : ""}
              {jobQ ? `jobId=${jobQ}` : ""}
              {" · "}
              <a href="/applicants" style={{ color: "var(--accent)" }}>
                Clear filters
              </a>
            </span>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <p style={{ ...T.mono, margin: "0 0 4px", color: "#3B82F6", textTransform: "uppercase", letterSpacing: ".1em" }}>Applicants</p>
          <h1 style={T.h1}>Applicants</h1>
        </div>
        {allowCreate && <Button onClick={openAdd}>+ Add Applicant</Button>}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
        <Select value={fJob} onChange={setFJob} options={[{ value: "", label: "All jobs" }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]} />
        <Select value={fStage} onChange={setFStage} options={[{ value: "", label: "All stages" }, ...STAGES.map((s) => ({ value: s, label: s }))]} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {list.map((a) => {
          const m = STAGE_META[a.stage];
          const rowHighlighted =
            (applicationQ && a.id === applicationQ) ||
            (!applicationQ && candidateQ && a.candidateId === candidateQ);
          return (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{ willChange: "transform" }}
            >
              <Card
              data-application-id={a.id}
              data-candidate-id={a.candidateId ?? ""}
              style={{
                padding: "14px 18px",
                ...(rowHighlighted
                  ? {
                      outline: "2px solid rgba(59, 130, 246, 0.85)",
                      outlineOffset: 2,
                      borderRadius: 8,
                    }
                  : {}),
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-heading-soft)" }}>{a.name}</span>
                  <span style={{ ...T.mono, marginLeft: 10, fontSize: 11, color: "var(--text-muted)" }}>{a.email}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <StageBadge stage={a.stage} />
                  <StarRating value={a.rating} />
                  <span style={{ ...T.mono, fontSize: 10, color: m?.color }}>{a.jobTitle}</span>
                  {canReadResume(role) && (
                    <Button
                      sm
                      variant="ghost"
                      onClick={() =>
                        setResumeModal({ open: true, candidateId: a.candidateId, name: a.name })
                      }
                    >
                      Résumé
                    </Button>
                  )}
                  {allowEdit && <Button sm variant="ghost" onClick={() => openEdit(a)}>Edit</Button>}
                  {allowDelete && (
                    <Button
                      sm
                      variant="danger"
                      disabled={deleteLoadingId === a.id}
                      onClick={() => setConfirmDelete(a)}
                    >
                      {deleteLoadingId === a.id ? "Removing…" : "Remove"}
                    </Button>
                  )}
                </div>
              </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      {deleteError ? (
        <div style={{ marginTop: 12, color: "#FCA5A5", fontSize: 13 }}>{deleteError}</div>
      ) : null}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Confirm removal"
      >
        <div style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0, color: "var(--text-body)", fontSize: 13 }}>
            Remove{" "}
            <span style={{ fontWeight: 700 }}>
              {confirmDelete?.name || "this applicant"}
            </span>
            {confirmDelete?.jobTitle ? ` (${confirmDelete.jobTitle})` : ""}?
          </p>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>
            This will withdraw the application and hide it from the pipeline.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Button
              sm
              variant="ghost"
              disabled={deleteLoadingId === confirmDelete?.id}
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              sm
              variant="danger"
              disabled={deleteLoadingId === confirmDelete?.id}
              onClick={() => {
                const a = confirmDelete;
                setConfirmDelete(null);
                if (a) void del(a);
              }}
            >
              {deleteLoadingId === confirmDelete?.id ? "Removing…" : "Remove"}
            </Button>
          </div>
        </div>
      </Modal>
      <ResumeCandidateModal
        open={resumeModal.open}
        onClose={() => setResumeModal((m) => ({ ...m, open: false }))}
        candidateId={resumeModal.candidateId}
        candidateName={resumeModal.name}
        userRole={role}
      />
      <Modal open={modal} onClose={() => { setModal(false); setSaveError(""); }} title={edit ? "Edit Applicant" : "Add Applicant"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div style={{ gridColumn: "1/-1" }}><Field label="Name"><Input value={form.name} onChange={(e) => setForm(f({ name: e.target.value }))} placeholder="Full name" /></Field></div>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm(f({ email: e.target.value }))} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm(f({ phone: e.target.value }))} /></Field>
          <Field label="Position"><Select value={form.jobId} onChange={(v) => setForm(f({ jobId: v }))} options={jobs.map((j) => ({ value: j.id, label: j.title }))} /></Field>
          <Field label="Stage"><Select value={form.stage} onChange={(v) => setForm(f({ stage: v }))} options={STAGES} /></Field>
          <Field label="Source"><Select value={form.source} onChange={(v) => setForm(f({ source: v }))} options={SOURCES} /></Field>
          {!edit ? (
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Résumé (required if job has match threshold)">
                <input
                  ref={resumeInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={saveLoading}
                  onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                  className="min-w-0 max-w-full text-sm text-[var(--text-body)] file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/15 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 dark:file:bg-blue-500/20 dark:file:text-blue-300"
                />
              </Field>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <Button sm variant="ghost" disabled={saveLoading || !resumeFile} onClick={() => void parseAndMatchNow()}>
                  {matchState.status === "working" ? "Parsing…" : "Parse résumé & match"}
                </Button>
                {thresholdIsConfigured ? (
                  <span style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)" }}>
                    Required: {Math.round(Number(thresholdForSelected))}% match
                  </span>
                ) : (
                  <span style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)" }}>
                    No threshold configured for this job.
                  </span>
                )}
              </div>
              {matchState.msg ? (
                <p style={{ ...T.mono, margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  {matchState.msg}
                </p>
              ) : null}
              {matchState.score ? (
                <p style={{ ...T.mono, margin: "6px 0 0", fontSize: 11, color: matchState.score.eligible ? "#34D399" : "#FCA5A5" }}>
                  Match: {typeof matchState.score.matchPercent === "number" ? `${matchState.score.matchPercent}%` : "—"} ·{" "}
                  {matchState.score.eligible ? "Eligible" : "Not eligible"}
                </p>
              ) : null}
            </div>
          ) : null}
          <div style={{ gridColumn: "1/-1" }}><Field label="Rating"><StarRating value={form.rating} onChange={(v) => setForm(f({ rating: v }))} /></Field></div>
          <div style={{ gridColumn: "1/-1" }}><Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm(f({ notes: e.target.value }))} rows={3} /></Field></div>
          <div style={{ gridColumn: "1/-1" }}><Field label="Tags (comma-separated)"><Input value={form.tags} onChange={(e) => setForm(f({ tags: e.target.value }))} placeholder="e.g. senior, remote" /></Field></div>
        </div>
        {saveError && <div style={{ marginTop: 12, color: "#FCA5A5", fontSize: 13 }}>{saveError}</div>}
        <div style={{ marginTop: 20 }}>
          <Button
            onClick={save}
            disabled={
              saveLoading ||
              (!edit && thresholdIsConfigured && matchState?.score?.eligible !== true)
            }
          >
            {saveLoading ? "Saving…" : thresholdIsConfigured && !edit && matchState?.score?.eligible !== true ? "Parse to enable Save" : "Save"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
