"use client";

import { useCallback, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { T } from "@/lib/helpers";

async function readJsonSafe(res) {
  return res.json().catch(() => ({}));
}

export default function ApplyFlow({ job }) {
  const [form, setForm] = useState({
    candidateName: "",
    email: "",
    contactNumber: "",
  });
  const [resumeFile, setResumeFile] = useState(null);

  const [busy, setBusy] = useState(false);
  /** idle | submitting | submitted | error */
  const [step, setStep] = useState("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [err, setErr] = useState("");
  const [applyResult, setApplyResult] = useState(null);

  const fileInputRef = useRef(null);
  const setF = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const submitApplication = useCallback(async () => {
    setErr("");
    setApplyResult(null);
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
      setErr("Please choose a resume file.");
      return;
    }

    setBusy(true);
    setStep("submitting");
    setStatusMsg("Submitting your application…");

    try {
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
        throw new Error(
          createBody?.error ||
            createBody?.message ||
            `Could not create application (${createRes.status})`,
        );
      }
      const candidateId = String(createBody?.id || "");
      if (!candidateId) {
        throw new Error("Application setup failed (no candidate id).");
      }

      setStatusMsg("Uploading resume…");
      const fd = new FormData();
      fd.set("file", resumeFile);
      const uploadRes = await fetch(
        `/api/candidates/${encodeURIComponent(candidateId)}/resume`,
        {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        },
      );
      const uploadBody = await readJsonSafe(uploadRes);
      if (!uploadRes.ok) {
        throw new Error(
          uploadBody?.error ||
            uploadBody?.message ||
            `Resume upload failed (${uploadRes.status})`,
        );
      }

      setStatusMsg("Creating application…");
      const applyRes = await fetch("/api/applications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          jobId: job.id,
          stage: "APPLIED",
        }),
      });
      const applyBody = await readJsonSafe(applyRes);
      if (!applyRes.ok) {
        throw new Error(
          applyBody?.message ||
            applyBody?.error ||
            `Application failed (${applyRes.status})`,
        );
      }

      setApplyResult(applyBody);
      setStep("submitted");
      setStatusMsg(
        "Thanks for applying! Your resume is being processed in the background.",
      );
    } catch (e) {
      setStep("error");
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setStatusMsg("");
    } finally {
      setBusy(false);
    }
  }, [form, job?.id, job?.status, resumeFile]);

  const resetForm = () => {
    setErr("");
    setStatusMsg("");
    setApplyResult(null);
    setResumeFile(null);
    setStep("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitted = step === "submitted";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="w-full min-w-0">
        <div className="mb-8 flex h-9 items-center">
          <img src="/agile_turn_logo.png" alt="Agile Turn Logo" className="h-full w-auto object-contain dark:invert" />
        </div>
        <p
          className="m-0 mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-500"
          style={T.mono}
        >
          Apply link
        </p>
        <h1 className="m-0 font-heading text-2xl font-medium tracking-[-0.03em] text-[var(--text-heading)]">
          Apply — {job?.title || "Job"}
        </h1>
      </div>

      {submitted ? (
        <Card className="glass-panel border-[var(--glass-border)] p-6 md:p-8">
          <p className="m-0 text-lg font-semibold text-[var(--text-heading)]">
            Thanks for applying!
          </p>
          <p className="m-0 mt-2 text-sm text-[var(--text-muted)]">
            We received your application for{" "}
            <span className="font-medium text-[var(--text-heading)]">
              {job?.title}
            </span>
            . Our team will review your resume and get back to you.
          </p>
          {applyResult?.id ? (
            <div className="mt-4 space-y-3">
              <p
                className="m-0 text-[11px] text-[var(--text-muted)]"
                style={T.mono}
              >
                Reference: {applyResult.id}
              </p>
              <a
                href={`/applications/${encodeURIComponent(String(applyResult.id))}`}
                className={cn(buttonVariants({ variant: "default" }), "inline-flex")}
              >
                View application status
              </a>
            </div>
          ) : null}
          <Button className="mt-6" variant="outline" onClick={resetForm}>
            Submit another application
          </Button>
        </Card>
      ) : (
        <Card className="glass-panel border-[var(--glass-border)] p-5 md:p-6">
          <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Candidate name</FieldLabel>
              <Input
                value={form.candidateName}
                disabled={busy}
                onChange={(e) => setF({ candidateName: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                value={form.email}
                disabled={busy}
                onChange={(e) => setF({ email: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Phone</FieldLabel>
              <Input
                value={form.contactNumber}
                disabled={busy}
                onChange={(e) => setF({ contactNumber: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Resume (PDF/DOC/DOCX)</FieldLabel>
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
          </FieldGroup>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void submitApplication()} disabled={busy}>
              {busy ? "Please wait…" : "Submit application"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={resetForm}>
              Reset
            </Button>
          </div>

          {statusMsg ? (
            <p
              className="mt-3 mb-0 text-sm text-[var(--text-muted)]"
              style={T.mono}
            >
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
      )}
    </div>
  );
}
