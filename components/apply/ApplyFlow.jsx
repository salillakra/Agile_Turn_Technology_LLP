"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { T } from "@/lib/helpers";

async function readJsonSafe(res) {
  return res.json().catch(() => ({}));
}

function parseJobMeta(jobMeta) {
  const obj = jobMeta && typeof jobMeta === "object" && !Array.isArray(jobMeta) ? jobMeta : null;
  const thresholdRaw = obj?.resumeMatchThreshold;
  const threshold =
    thresholdRaw === null || thresholdRaw === undefined || thresholdRaw === ""
      ? null
      : Number(thresholdRaw);
  const requiredSkillsRaw = obj?.requiredSkills;
  const requiredSkills = Array.isArray(requiredSkillsRaw)
    ? requiredSkillsRaw.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  return {
    threshold: threshold != null && Number.isFinite(threshold) ? threshold : null,
    requiredSkills,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function ApplyFlow({ job }) {
  const { threshold, requiredSkills } = useMemo(() => parseJobMeta(job?.jobMeta), [job?.jobMeta]);
  const [form, setForm] = useState({
    candidateName: "",
    email: "",
    contactNumber: "",
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [candidateId, setCandidateId] = useState("");

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("idle"); // idle | uploading | parsing | applyingParse | scoring | ready | applied | blocked | error
  const [statusMsg, setStatusMsg] = useState("");
  const [err, setErr] = useState("");
  const [score, setScore] = useState(null); // { eligible, matchPercent, requiredThreshold, ... }
  const [applyResult, setApplyResult] = useState(null);

  const fileInputRef = useRef(null);

  const setF = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const parseAndScore = useCallback(async () => {
    setErr("");
    setApplyResult(null);
    setScore(null);
    setStatusMsg("");

    if (!job?.id) {
      setErr("Missing job.");
      return;
    }
    if (job.status !== "OPEN") {
      setErr("This job is not open for applications.");
      return;
    }
    const candidateName = form.candidateName.trim();
    const email = form.email.trim();
    const contactNumber = form.contactNumber.trim();
    if (!candidateName || !email || !contactNumber) {
      setErr("Candidate name, email, and phone are required.");
      return;
    }
    if (!resumeFile) {
      setErr("Please choose a résumé file.");
      return;
    }
    if (threshold != null && threshold > 0 && requiredSkills.length > 0 && !String(job?.jobMeta?.requiredSkills ?? "").length) {
      // no-op; requiredSkills already derived, keep for defensive clarity
    }

    setBusy(true);
    try {
      // 1) Create candidate
      setStep("uploading");
      setStatusMsg("Creating candidate…");
      const createRes = await fetch("/api/candidates", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName,
          email,
          contactNumber,
          candidateSource: "OTHER",
        }),
      });
      const createBody = await readJsonSafe(createRes);
      if (!createRes.ok) {
        throw new Error(createBody?.error || createBody?.message || `Candidate create failed (${createRes.status})`);
      }
      const newCandidateId = String(createBody?.id || "");
      if (!newCandidateId) {
        throw new Error("Candidate create returned no id.");
      }
      setCandidateId(newCandidateId);

      // 2) Upload resume
      setStatusMsg("Uploading résumé…");
      const fd = new FormData();
      fd.set("file", resumeFile);
      const uploadRes = await fetch(`/api/candidates/${encodeURIComponent(newCandidateId)}/resume`, {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const uploadBody = await readJsonSafe(uploadRes);
      if (!uploadRes.ok) {
        throw new Error(uploadBody?.error || uploadBody?.message || `Resume upload failed (${uploadRes.status})`);
      }

      // 3) Enqueue parse
      setStep("parsing");
      setStatusMsg("Parsing résumé (queued)…");
      const parseRes = await fetch(`/api/candidates/${encodeURIComponent(newCandidateId)}/resume/parse`, {
        method: "POST",
        credentials: "same-origin",
      });
      const parseBody = await readJsonSafe(parseRes);
      if (!parseRes.ok) {
        throw new Error(parseBody?.error || parseBody?.message || `Parse enqueue failed (${parseRes.status})`);
      }

      // 4) Poll parse status until DONE/FAILED (max ~75s)
      const startedAt = Date.now();
      let delay = 800;
      let latest = null;
      while (Date.now() - startedAt < 75_000) {
        const stRes = await fetch(`/api/candidates/${encodeURIComponent(newCandidateId)}/parse-status`, {
          credentials: "same-origin",
        });
        const stBody = await readJsonSafe(stRes);
        if (!stRes.ok) {
          throw new Error(stBody?.error || stBody?.message || `Parse status failed (${stRes.status})`);
        }
        latest = stBody;
        const status = stBody?.status;
        if (status === "COMPLETED" || status === "FAILED") break;
        setStatusMsg(`Parsing résumé… (${String(status || "PENDING")})`);
        // eslint-disable-next-line no-await-in-loop
        await sleep(delay);
        delay = Math.min(5000, Math.round(delay * 1.4));
      }
      if (!latest || latest.status !== "COMPLETED") {
        const msg = latest?.status === "FAILED" ? String(latest?.error || "Parse failed") : "Parse did not complete in time.";
        throw new Error(msg);
      }

      // 5) Apply parse output to candidate skills (required by your rule)
      setStep("applyingParse");
      setStatusMsg("Applying parsed skills…");
      const applyRes = await fetch(`/api/candidates/${encodeURIComponent(newCandidateId)}/resume/parse/apply`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeParseJobId: latest.resumeParseJobId,
          result: latest.result,
        }),
      });
      const applyBody = await readJsonSafe(applyRes);
      if (!applyRes.ok) {
        throw new Error(applyBody?.error || applyBody?.message || `Apply parse failed (${applyRes.status})`);
      }

      // 6) Score match + eligibility
      setStep("scoring");
      setStatusMsg("Computing match score…");
      const scoreRes = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/resume-match?candidateId=${encodeURIComponent(newCandidateId)}`,
        { credentials: "same-origin" }
      );
      const scoreBody = await readJsonSafe(scoreRes);
      if (!scoreRes.ok) {
        throw new Error(scoreBody?.error || scoreBody?.message || `Score failed (${scoreRes.status})`);
      }
      setScore(scoreBody);

      if (scoreBody?.eligible === true) {
        setStep("ready");
        setStatusMsg("Eligible — you can apply now.");
      } else {
        setStep("blocked");
        setStatusMsg("Not eligible for this role.");
      }
    } catch (e) {
      setStep("error");
      setErr(e instanceof Error ? e.message : "Failed");
      setStatusMsg("");
    } finally {
      setBusy(false);
    }
  }, [form, job, requiredSkills.length, resumeFile, threshold]);

  const submitApply = useCallback(async () => {
    setErr("");
    setApplyResult(null);
    if (!candidateId || !job?.id) return;
    if (!score?.eligible) return;
    setBusy(true);
    setStatusMsg("Submitting application…");
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobId: job.id, stage: "APPLIED" }),
      });
      const body = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Apply failed (${res.status})`);
      }
      setApplyResult(body);
      setStep("applied");
      setStatusMsg("Application created.");
    } catch (e) {
      setStep("error");
      setErr(e instanceof Error ? e.message : "Apply failed");
      setStatusMsg("");
    } finally {
      setBusy(false);
    }
  }, [candidateId, job?.id, score?.eligible]);

  const eligibleBadge = score?.eligible === true;
  const blockedBadge = score?.eligible === false;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="w-full min-w-0">
        <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-500" style={T.mono}>
          Apply link
        </p>
        <h1 className="m-0 font-['Fraunces',serif] text-2xl font-extrabold text-[var(--text-heading)]">
          Apply — {job?.title || "Job"}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Upload résumé → parse → compute match score → eligibility → apply.
        </p>
      </div>

      <Card glass style={{ padding: "18px 22px" }}>
        <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-4 [&>*]:min-w-0">
          <Field label="Candidate name">
            <Input value={form.candidateName} onChange={(e) => setF({ candidateName: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setF({ email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.contactNumber} onChange={(e) => setF({ contactNumber: e.target.value })} />
          </Field>
          <Field label="Résumé (PDF/DOC/DOCX)">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setResumeFile(f);
              }}
              className="min-w-0 max-w-full text-sm text-[var(--text-body)] file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/15 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 dark:file:bg-blue-500/20 dark:file:text-blue-300"
            />
          </Field>
        </div>

        {threshold != null && threshold > 0 ? (
          <div className="mt-2 rounded-xl border border-[var(--app-border)]/40 bg-[var(--chrome-muted-bg)] px-3 py-2 text-sm text-[var(--text-muted)]">
            Threshold: <span className="text-[var(--text-heading)]">{threshold}%</span> (required skills:{" "}
            <span className="text-[var(--text-heading)]">{requiredSkills.length}</span>)
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-[var(--app-border)]/40 bg-[var(--chrome-muted-bg)] px-3 py-2 text-sm text-[var(--text-muted)]">
            No match threshold configured for this job (applications allowed without scoring).
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void parseAndScore()} disabled={busy}>
            {busy && (step === "uploading" || step === "parsing" || step === "applyingParse" || step === "scoring")
              ? "Working…"
              : "Parse résumé & compute match"}
          </Button>
          <Button onClick={() => void submitApply()} disabled={busy || !score?.eligible}>
            Apply for role
          </Button>
          <Button
            variant="ghost"
            sm
            disabled={busy}
            onClick={() => {
              setErr("");
              setStatusMsg("");
              setScore(null);
              setApplyResult(null);
              setCandidateId("");
              setResumeFile(null);
              setStep("idle");
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            Reset
          </Button>
        </div>

        {statusMsg ? (
          <p className="mt-3 mb-0 text-sm text-[var(--text-muted)]" style={T.mono}>
            {statusMsg}
          </p>
        ) : null}
        {err ? (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-600 backdrop-blur-md dark:text-red-300"
          >
            {err}
          </div>
        ) : null}
      </Card>

      {score ? (
        <Card glass style={{ padding: "18px 22px" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-blue-500" style={T.mono}>
                Match score
              </p>
              <p className="m-0 mt-1 text-lg font-bold text-[var(--text-heading)]">
                {typeof score.matchPercent === "number" ? `${score.matchPercent}%` : "—"}
              </p>
            </div>
            <div>
              {eligibleBadge ? (
                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Eligible
                </span>
              ) : blockedBadge ? (
                <span className="rounded-full border border-red-400/35 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-600 dark:text-red-300">
                  Not eligible
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]" style={T.mono}>
                Threshold
              </p>
              <p className="m-0 mt-1 text-sm text-[var(--text-heading)]">
                {score.requiredThreshold != null ? `${score.requiredThreshold}%` : "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]" style={T.mono}>
                Matched skills
              </p>
              <p className="m-0 mt-1 text-sm text-[var(--text-heading)]">
                {score.matchedSkillsCount != null && score.requiredSkillsCount != null
                  ? `${score.matchedSkillsCount}/${score.requiredSkillsCount}`
                  : "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]" style={T.mono}>
                Reason
              </p>
              <p className="m-0 mt-1 break-all text-sm text-[var(--text-heading)]">{String(score.reason || "—")}</p>
            </div>
          </div>
          {Array.isArray(score.candidateSkillsSample) && score.candidateSkillsSample.length > 0 ? (
            <div className="mt-4">
              <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]" style={T.mono}>
                Candidate skills (sample)
              </p>
              <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">
                {score.candidateSkillsSample.join(", ")}
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {applyResult ? (
        <Card glass style={{ padding: "18px 22px" }}>
          <p className="m-0 text-sm text-[var(--text-muted)]">Application created.</p>
          <p className="m-0 mt-2 text-[11px] text-[var(--text-muted)]" style={T.mono}>
            Application ID: {applyResult.id}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

