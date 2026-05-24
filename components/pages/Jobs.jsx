"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { T } from "@/lib/helpers";
import { DEPARTMENTS, LOCATIONS } from "@/data/mockData";
import { uid } from "@/lib/helpers";
import {
  canCreateJob,
  canDeleteJob,
  canUpdateJob,
  canManageRecruiterAssignments,
  isAdmin,
} from "@/src/lib/rbac";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import Badge from "@/components/ui/Badge";
import { motion } from "framer-motion";

export default function Jobs({ jobs, setJobs, applicants = [], refreshJobs }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const allowCreateJob = canCreateJob(role);
  const allowEditJob = canUpdateJob(role);
  const allowDeleteJob = canDeleteJob(role);
  const allowManageAssignments = canManageRecruiterAssignments(role);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState("");
  const [copiedJobId, setCopiedJobId] = useState("");
  const [form, setForm] = useState({
    title: "",
    dept: "Engineering",
    loc: "Remote",
    status: "Open",
    employmentType: "FULL_TIME",
    openings: 1,
    roleSummary: "",
    keyResponsibilities: "",
    requiredSkills: "",
    preferredSkills: "",
    resumeMatchThreshold: "",
    experienceRequired: "",
    pipelineStages: "APPLIED, SCREENING, INTERVIEW, OFFER_SENT, HIRED",
    salaryMin: "",
    salaryMax: "",
    currency: "INR",
    budgetApprovalStatus: "",
    education: "",
    minimumExperienceYears: "",
    locationConstraints: "",
    applicationDeadline: "",
    allowReferrals: true,
    tags: "",
  });
  const [saveError, setSaveError] = useState("");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignJob, setAssignJob] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [assignError, setAssignError] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [roleFilter, setRoleFilter] = useState("HIRING_MANAGER");
  const [userSearch, setUserSearch] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const f = (v) => Object.assign({}, form, v);
  const open = (job = null) => {
    setEdit(job);
    setSaveError("");
    setForm(
      job
        ? {
            ...form,
            ...job,
            requiredSkills: Array.isArray(job?.jobMeta?.requiredSkills)
              ? job.jobMeta.requiredSkills.join(", ")
              : "",
            preferredSkills: Array.isArray(job?.jobMeta?.preferredSkills)
              ? job.jobMeta.preferredSkills.join(", ")
              : "",
            resumeMatchThreshold:
              job?.jobMeta?.resumeMatchThreshold != null ? String(job.jobMeta.resumeMatchThreshold) : "",
            pipelineStages: Array.isArray(job?.jobMeta?.pipelineStages)
              ? job.jobMeta.pipelineStages.join(", ")
              : "APPLIED, SCREENING, INTERVIEW, OFFER_SENT, HIRED",
            tags: Array.isArray(job?.jobMeta?.tags) ? job.jobMeta.tags.join(", ") : "",
            roleSummary: typeof job?.jobMeta?.roleSummary === "string" ? job.jobMeta.roleSummary : "",
            keyResponsibilities:
              typeof job?.jobMeta?.keyResponsibilities === "string"
                ? job.jobMeta.keyResponsibilities
                : "",
            experienceRequired:
              typeof job?.jobMeta?.experienceRequired === "string"
                ? job.jobMeta.experienceRequired
                : "",
            budgetApprovalStatus:
              typeof job?.jobMeta?.budgetApprovalStatus === "string"
                ? job.jobMeta.budgetApprovalStatus
                : "",
            education: typeof job?.jobMeta?.education === "string" ? job.jobMeta.education : "",
            locationConstraints:
              typeof job?.jobMeta?.locationConstraints === "string"
                ? job.jobMeta.locationConstraints
                : "",
            salaryMin:
              job?.jobMeta?.salaryMin != null ? String(job.jobMeta.salaryMin) : "",
            salaryMax:
              job?.jobMeta?.salaryMax != null ? String(job.jobMeta.salaryMax) : "",
            currency: typeof job?.jobMeta?.currency === "string" ? job.jobMeta.currency : "INR",
            minimumExperienceYears:
              job?.jobMeta?.minimumExperienceYears != null
                ? String(job.jobMeta.minimumExperienceYears)
                : "",
            applicationDeadline:
              typeof job?.jobMeta?.applicationDeadline === "string"
                ? String(job.jobMeta.applicationDeadline).slice(0, 10)
                : "",
            allowReferrals: job?.jobMeta?.allowReferrals !== false,
            employmentType:
              typeof job?.jobMeta?.employmentType === "string"
                ? job.jobMeta.employmentType
                : job.employmentType || "FULL_TIME",
          }
        : {
            title: "",
            dept: "Engineering",
            loc: "Remote",
            status: "Open",
            employmentType: "FULL_TIME",
            openings: 1,
            roleSummary: "",
            keyResponsibilities: "",
            requiredSkills: "",
            preferredSkills: "",
            resumeMatchThreshold: "",
            experienceRequired: "",
            pipelineStages: "APPLIED, SCREENING, INTERVIEW, OFFER_SENT, HIRED",
            salaryMin: "",
            salaryMax: "",
            currency: "INR",
            budgetApprovalStatus: "",
            education: "",
            minimumExperienceYears: "",
            locationConstraints: "",
            applicationDeadline: "",
            allowReferrals: true,
            tags: "",
          }
    );
    setModal(true);
  };
  const save = async () => {
    if (!form.title) return;
    setSaveError("");
    const splitCsv = (v) =>
      String(v || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const statusMap = { Open: "OPEN", Paused: "PAUSED", Closed: "CLOSED" };
    const apiStatus = statusMap[form.status] || "OPEN";
    const jobMetaPayload = {
      employmentType: form.employmentType,
      numberOfOpenings: Number(form.openings) || 1,
      roleSummary: form.roleSummary,
      keyResponsibilities: form.keyResponsibilities,
      requiredSkills: splitCsv(form.requiredSkills),
      preferredSkills: splitCsv(form.preferredSkills),
      resumeMatchThreshold:
        String(form.resumeMatchThreshold ?? "").trim() === "" ? null : Number(form.resumeMatchThreshold),
      experienceRequired: form.experienceRequired,
      pipelineStages: splitCsv(form.pipelineStages),
      salaryMin: form.salaryMin === "" ? null : Number(form.salaryMin),
      salaryMax: form.salaryMax === "" ? null : Number(form.salaryMax),
      currency: form.currency || null,
      budgetApprovalStatus: form.budgetApprovalStatus || null,
      education: form.education || null,
      minimumExperienceYears:
        form.minimumExperienceYears === "" ? null : Number(form.minimumExperienceYears),
      locationConstraints: form.locationConstraints || null,
      applicationDeadline: form.applicationDeadline || null,
      allowReferrals: !!form.allowReferrals,
      tags: splitCsv(form.tags),
    };
    const payload = {
      title: form.title,
      department: form.dept,
      location: form.loc,
      status: apiStatus,
      ...jobMetaPayload,
      jobMeta: jobMetaPayload,
      description: form.roleSummary || null,
      additionalComments: null,
      yearsOfExperience: null,
    };

    if (typeof refreshJobs === "function") {
      try {
        if (edit) {
          const res = await fetch(`/api/jobs/${edit.id}`, {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setSaveError(body?.message || body?.error || `Update failed (${res.status})`);
            return;
          }
        } else {
          const res = await fetch("/api/jobs", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setSaveError(body?.message || body?.error || `Create failed (${res.status})`);
            return;
          }
        }
        await refreshJobs();
        setModal(false);
      } catch {
        setSaveError("Network error");
      }
      return;
    }
    if (edit) setJobs((prev) => prev.map((j) => (j.id === edit.id ? { ...j, ...form } : j)));
    else setJobs((prev) => [...prev, { ...form, id: uid(), posted: new Date().toISOString().split("T")[0] }]);
    setModal(false);
  };
  const copyApplyLink = async (jobId) => {
    const absoluteUrl = `${window.location.origin}/apply/${jobId}`;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopiedJobId(jobId);
      setTimeout(() => setCopiedJobId(""), 1500);
    } catch {
      setCopiedJobId("");
    }
  };

  const loadAssignments = async (jobId) => {
    setAssignLoading(true);
    setAssignError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/assignments`, {
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignError(body?.message || body?.error || `Load failed (${res.status})`);
        setAssignments([]);
        return;
      }
      setAssignments(Array.isArray(body?.data) ? body.data : []);
    } catch {
      setAssignError("Network error while loading assignments");
      setAssignments([]);
    } finally {
      setAssignLoading(false);
    }
  };

  const openAssignModal = async (job) => {
    setAssignJob(job);
    setAssignModalOpen(true);
    setSelectedUserId("");
    setUserSearch("");
    setRoleFilter(isAdmin(role) ? "HIRING_MANAGER" : "RECRUITER");
    await loadAssignments(job.id);
  };

  useEffect(() => {
    if (!assignModalOpen || !assignJob) return;
    let cancelled = false;
    async function run() {
      setLoadingUsers(true);
      try {
        const roleParam = isAdmin(role) ? "HIRING_MANAGER" : "RECRUITER";
        const url = `/api/users?role=${encodeURIComponent(roleParam)}&q=${encodeURIComponent(userSearch)}`;
        const res = await fetch(url, { credentials: "same-origin" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setUserOptions([]);
          return;
        }
        const rows = Array.isArray(body?.data) ? body.data : [];
        if (!cancelled) setUserOptions(rows);
      } catch {
        if (!cancelled) setUserOptions([]);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [assignModalOpen, assignJob, roleFilter, userSearch, role]);

  const addAssignment = async () => {
    if (!assignJob || !selectedUserId) return;
    setAssigning(true);
    setAssignError("");
    try {
      const res = await fetch(`/api/jobs/${assignJob.id}/assignments`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignError(body?.message || body?.error || `Assign failed (${res.status})`);
        return;
      }
      setSelectedUserId("");
      await loadAssignments(assignJob.id);
    } catch {
      setAssignError("Network error while assigning user");
    } finally {
      setAssigning(false);
    }
  };

  const removeAssignment = async (jobId, userId) => {
    setAssignError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/assignments/${userId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAssignError(body?.message || body?.error || `Remove failed (${res.status})`);
        return;
      }
      await loadAssignments(jobId);
    } catch {
      setAssignError("Network error while removing assignment");
    }
  };

  const list = jobs.filter((j) => j.title.toLowerCase().includes(q.toLowerCase()) || j.dept.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <p style={{ ...T.mono, margin: "0 0 4px", color: "#3B82F6", textTransform: "uppercase", letterSpacing: ".1em" }}>Job Management</p>
          <h1 style={T.h1}>Open Positions</h1>
        </div>
        {allowCreateJob && <Button onClick={() => open()}>+ New Position</Button>}
      </div>
      <Input placeholder="Search positions…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, maxWidth: 340 }} />
      <div style={{ display: "grid", gap: 12 }}>
        {list.map((job) => {
          const appCnt =
            job.applicantCount != null
              ? job.applicantCount
              : applicants.filter((a) => a.jobId === job.id).length;
          const hiredCnt =
            job.hiredCount != null
              ? job.hiredCount
              : applicants.filter((a) => a.jobId === job.id && a.stage === "Hired").length;
          const openingsDen = Math.max(1, Number(job.openings) || 1);
          return (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{ willChange: "transform" }}
            >
              <Card style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-heading)", fontFamily: "'Fraunces',serif" }}>{job.title}</span>
                    <Badge label={job.status} color={job.status === "Open" ? "#34D399" : job.status === "Paused" ? "#FBBF24" : "#F87171"} bg={job.status === "Open" ? "rgba(52,211,153,.1)" : job.status === "Paused" ? "rgba(251,191,36,.1)" : "rgba(248,113,113,.1)"} />
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {[`🏢 ${job.dept}`, `📍 ${job.loc}`, `💼 ${job.employmentType || "-"}`, `💰 ${job.salary || "-"}`].map((t, i) => (
                      <span key={i} style={{ ...T.mono, fontSize: 11 }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#60A5FA", fontFamily: "'Fraunces',serif" }}>{appCnt}</p>
                    <p style={{ ...T.mono, margin: 0, fontSize: 9 }}>APPLICANTS</p>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#34D399", fontFamily: "'Fraunces',serif" }}>{hiredCnt}/{openingsDen}</p>
                    <p style={{ ...T.mono, margin: 0, fontSize: 9 }}>FILLED</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Link
                      href={`/apply/${job.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(96,165,250,.35)",
                        background: "rgba(59,130,246,.12)",
                        color: "var(--accent)",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: ".02em",
                        textDecoration: "none",
                      }}
                    >
                      Apply Link
                    </Link>
                    <Button sm variant="ghost" onClick={() => copyApplyLink(job.id)}>
                      {copiedJobId === job.id ? "Copied" : "Copy Link"}
                    </Button>
                    {allowManageAssignments && (
                      <Button sm variant="ghost" onClick={() => openAssignModal(job)}>
                        Assign
                      </Button>
                    )}
                    {allowEditJob && (
                      <Button sm variant="ghost" onClick={() => open(job)}>✏ Edit</Button>
                    )}
                    {allowDeleteJob && (
                      <Button
                        sm
                        variant="danger"
                        onClick={async () => {
                          if (typeof refreshJobs === "function") {
                            const res = await fetch(`/api/jobs/${job.id}`, {
                              method: "DELETE",
                              credentials: "same-origin",
                            });
                            if (res.status === 204) await refreshJobs();
                            else {
                              const body = await res.json().catch(() => ({}));
                              window.alert(body?.message || body?.error || `Delete failed (${res.status})`);
                            }
                            return;
                          }
                          setJobs((prev) => prev.filter((j) => j.id !== job.id));
                        }}
                      >
                        ✕ Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, height: 4, background: "rgba(255,255,255,.05)", borderRadius: 99, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, (hiredCnt / openingsDen) * 100)}%`,
                    background: "#34D399",
                    borderRadius: 99,
                  }}
                />
              </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Position" : "New Position"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div style={{ gridColumn: "1/-1" }}>
            <Field label="Job Title"><Input value={form.title} onChange={(e) => setForm(f({ title: e.target.value }))} placeholder="e.g. Senior Engineer" /></Field>
          </div>
          <Field label="Department"><Select value={form.dept} onChange={(v) => setForm(f({ dept: v }))} options={DEPARTMENTS} /></Field>
          <Field label="Location"><Select value={form.loc} onChange={(v) => setForm(f({ loc: v }))} options={LOCATIONS} /></Field>
          <Field label="Employment Type">
            <Select
              value={form.employmentType}
              onChange={(v) => setForm(f({ employmentType: v }))}
              options={[
                { value: "FULL_TIME", label: "Full-time" },
                { value: "INTERNSHIP", label: "Internship" },
                { value: "CONTRACT", label: "Contract" },
              ]}
            />
          </Field>
          <Field label="Openings"><Input type="number" min={1} value={form.openings} onChange={(e) => setForm(f({ openings: +e.target.value }))} /></Field>
          <Field label="Role Summary">
            <Textarea rows={3} value={form.roleSummary} onChange={(e) => setForm(f({ roleSummary: e.target.value }))} />
          </Field>
          <Field label="Key Responsibilities">
            <Textarea rows={3} value={form.keyResponsibilities} onChange={(e) => setForm(f({ keyResponsibilities: e.target.value }))} />
          </Field>
          <Field label="Required Skills (comma-separated)">
            <Input value={form.requiredSkills} onChange={(e) => setForm(f({ requiredSkills: e.target.value }))} />
          </Field>
          <Field label="Preferred Skills (comma-separated)">
            <Input value={form.preferredSkills} onChange={(e) => setForm(f({ preferredSkills: e.target.value }))} />
          </Field>
          <Field label="Resume match threshold (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.resumeMatchThreshold}
              onChange={(e) => setForm(f({ resumeMatchThreshold: e.target.value }))}
              placeholder="e.g. 80"
            />
          </Field>
          <Field label="Experience Required">
            <Input value={form.experienceRequired} onChange={(e) => setForm(f({ experienceRequired: e.target.value }))} placeholder="e.g. 2-4 years" />
          </Field>
          <Field label="Pipeline Stages (comma-separated)">
            <Input value={form.pipelineStages} onChange={(e) => setForm(f({ pipelineStages: e.target.value }))} />
          </Field>
          <Field label="Salary Min"><Input type="number" min={0} value={form.salaryMin} onChange={(e) => setForm(f({ salaryMin: e.target.value }))} /></Field>
          <Field label="Salary Max"><Input type="number" min={0} value={form.salaryMax} onChange={(e) => setForm(f({ salaryMax: e.target.value }))} /></Field>
          <Field label="Currency"><Input value={form.currency} onChange={(e) => setForm(f({ currency: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Budget Approval Status"><Input value={form.budgetApprovalStatus} onChange={(e) => setForm(f({ budgetApprovalStatus: e.target.value }))} /></Field>
          <Field label="Education"><Input value={form.education} onChange={(e) => setForm(f({ education: e.target.value }))} /></Field>
          <Field label="Minimum Experience (years)"><Input type="number" min={0} value={form.minimumExperienceYears} onChange={(e) => setForm(f({ minimumExperienceYears: e.target.value }))} /></Field>
          <Field label="Location Constraints"><Input value={form.locationConstraints} onChange={(e) => setForm(f({ locationConstraints: e.target.value }))} /></Field>
          <Field label="Application Deadline"><Input type="date" value={form.applicationDeadline} onChange={(e) => setForm(f({ applicationDeadline: e.target.value }))} /></Field>
          <Field label="Allow Referrals">
            <Select
              value={form.allowReferrals ? "YES" : "NO"}
              onChange={(v) => setForm(f({ allowReferrals: v === "YES" }))}
              options={[
                { value: "YES", label: "Yes" },
                { value: "NO", label: "No" },
              ]}
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <Input value={form.tags} onChange={(e) => setForm(f({ tags: e.target.value }))} placeholder="urgent, remote, campus" />
          </Field>
          <Field label="Status"><Select value={form.status} onChange={(v) => setForm(f({ status: v }))} options={["Open", "Paused", "Closed"]} /></Field>
        </div>
        {saveError ? (
          <p style={{ color: "#FCA5A5", fontSize: 12, marginTop: 12, fontFamily: "'DM Mono',monospace" }}>{saveError}</p>
        ) : null}
        <div style={{ marginTop: 20 }}>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal>
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={assignJob ? `Assignments — ${assignJob.title}` : "Assignments"}
      >
        <div style={{ display: "grid", gap: 10 }}>
          {isAdmin(role) && (
            <Field label="Assign role">
              <Select
                value={roleFilter}
                onChange={setRoleFilter}
                options={[{ value: "HIRING_MANAGER", label: "Hiring Manager" }]}
              />
            </Field>
          )}
          <Field label="Search user">
            <Input
              placeholder="Type name or email"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </Field>
          <Field label="Select user">
            <Select
              value={selectedUserId}
              onChange={setSelectedUserId}
              options={[
                { value: "", label: loadingUsers ? "Loading users..." : "Select a user" },
                ...userOptions.map((u) => ({
                  value: u.id,
                  label: `${u.name} (${u.email}) — ${u.role}`,
                })),
              ]}
            />
          </Field>
          <div>
            <Button onClick={addAssignment} disabled={!selectedUserId || assigning}>
              {assigning ? "Assigning..." : "Add Assignment"}
            </Button>
          </div>
          <div style={{ marginTop: 8 }}>
            <p style={{ ...T.mono, margin: "0 0 8px", fontSize: 11, color: "var(--text-muted)" }}>
              Current assignments
            </p>
            {assignLoading ? (
              <p style={{ ...T.mono, margin: 0, fontSize: 11 }}>Loading...</p>
            ) : assignments.length === 0 ? (
              <p style={{ ...T.mono, margin: 0, fontSize: 11 }}>No assignments</p>
            ) : (
              <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 10px",
                      border: "1px solid var(--app-border)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.user?.name || a.userId}</div>
                      <div style={{ ...T.mono, fontSize: 10, color: "var(--text-muted)" }}>
                        {a.user?.email} · {a.user?.role}
                      </div>
                    </div>
                    <Button
                      sm
                      variant="danger"
                      onClick={() => removeAssignment(a.jobId, a.userId)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {assignError ? (
            <p style={{ color: "#FCA5A5", fontSize: 12, margin: 0, fontFamily: "'DM Mono',monospace" }}>
              {assignError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
