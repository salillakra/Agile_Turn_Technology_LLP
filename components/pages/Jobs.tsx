"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Briefcase, Buildings, MapPin, CurrencyDollar, Users,
  Plus, Copy, Pencil, Trash, UserPlus, Check, SpinnerGap,
  FileArrowUp, DownloadSimple,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { DEPARTMENTS, LOCATIONS } from "@/data/mockData";
import {
  canCreateJob, canDeleteJob, canUpdateJob,
  canManageRecruiterAssignments, isAdmin,
} from "@/src/lib/rbac";
import { validateNewJobForm } from "@/src/lib/job-create-form-validation";
import {
  useCreateJob, useUpdateJob, useDeleteJob,
  useJobAssignments, useUsers, useAddAssignment, useRemoveAssignment,
  useImportJobs,
  type JobImportResult,
} from "@/hooks/queries/useJobs";
import { downloadJobCsvTemplate, JOB_CSV_MAX_ROWS } from "@/src/lib/job-csv-import";
import type { Job } from "@/lib/api/jobs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface JobProps {
  jobs: Job[];
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>;
  applicants?: unknown[];
  refreshJobs: () => Promise<void>;
}

type FormState = {
  title: string; dept: string; loc: string; status: string; employmentType: string;
  openings: number; roleSummary: string; keyResponsibilities: string; requiredSkills: string;
  preferredSkills: string; resumeMatchThreshold: string; experienceRequired: string;
  pipelineStages: string; salaryMin: string; salaryMax: string; currency: string;
  budgetApprovalStatus: string; education: string; minimumExperienceYears: string;
  locationConstraints: string; applicationDeadline: string; allowReferrals: boolean; tags: string;
};

const DEFAULT_FORM: FormState = {
  title: "", dept: "Engineering", loc: "Remote", status: "Open",
  employmentType: "FULL_TIME", openings: 1, roleSummary: "", keyResponsibilities: "",
  requiredSkills: "", preferredSkills: "", resumeMatchThreshold: "", experienceRequired: "",
  pipelineStages: "APPLIED, SCREENING, INTERVIEW, OFFER_SENT, HIRED", salaryMin: "", salaryMax: "",
  currency: "INR", budgetApprovalStatus: "", education: "", minimumExperienceYears: "",
  locationConstraints: "", applicationDeadline: "", allowReferrals: true, tags: "",
};

function jobToForm(job: Job): FormState {
  const m = job.jobMeta ?? {};
  return {
    title: job.title || "",
    dept: job.department || "Engineering",
    loc: job.location || "Remote",
    status: job.status === "OPEN" ? "Open" : job.status === "PAUSED" ? "Paused" : "Closed",
    employmentType: m.employmentType || job.employmentType || "FULL_TIME",
    openings: m.numberOfOpenings || 1,
    roleSummary: m.roleSummary || "",
    keyResponsibilities: m.keyResponsibilities || "",
    requiredSkills: Array.isArray(m.requiredSkills) ? m.requiredSkills.join(", ") : "",
    preferredSkills: Array.isArray(m.preferredSkills) ? m.preferredSkills.join(", ") : "",
    resumeMatchThreshold: m.resumeMatchThreshold != null ? String(m.resumeMatchThreshold) : "",
    experienceRequired: m.experienceRequired || "",
    pipelineStages: Array.isArray(m.pipelineStages) ? m.pipelineStages.join(", ") : "APPLIED, SCREENING, INTERVIEW, OFFER_SENT, HIRED",
    salaryMin: m.salaryMin != null ? String(m.salaryMin) : "",
    salaryMax: m.salaryMax != null ? String(m.salaryMax) : "",
    currency: m.currency || "INR",
    budgetApprovalStatus: m.budgetApprovalStatus || "",
    education: m.education || "",
    minimumExperienceYears: m.minimumExperienceYears != null ? String(m.minimumExperienceYears) : "",
    locationConstraints: m.locationConstraints || "",
    applicationDeadline: m.applicationDeadline ? String(m.applicationDeadline).slice(0, 10) : "",
    allowReferrals: m.allowReferrals !== false,
    tags: Array.isArray(m.tags) ? m.tags.join(", ") : "",
  };
}

export default function Jobs({ jobs, applicants = [], refreshJobs }: JobProps) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const allowCreateJob = canCreateJob(role);
  const allowEditJob = canUpdateJob(role);
  const allowDeleteJob = canDeleteJob(role);
  const allowManageAssignments = canManageRecruiterAssignments(role);

  const [modalOpen, setModalOpen] = useState(false);
  const [editJobData, setEditJobData] = useState<Job | null>(null);
  const [q, setQ] = useState("");
  const [copiedJobId, setCopiedJobId] = useState("");
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignJob, setAssignJob] = useState<Job | null>(null);
  const [roleFilter, setRoleFilter] = useState("HIRING_MANAGER");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<JobImportResult | null>(null);
  const [importError, setImportError] = useState("");

  // TanStack Query mutations
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const importJobs = useImportJobs();

  // Assignment queries (enabled only when modal open)
  const assignmentsQuery = useJobAssignments(assignJob?.id ?? "", !!assignJob && assignModalOpen);
  const usersQuery = useUsers(roleFilter, userSearch, !!assignJob && assignModalOpen);
  const addAssignment = useAddAssignment(assignJob?.id ?? "");
  const removeAssignment = useRemoveAssignment(assignJob?.id ?? "");

  const updateForm = (fields: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...fields }));

  const openFormModal = (job: Job | null = null) => {
    setEditJobData(job);
    setSaveError("");
    setForm(job ? jobToForm(job) : DEFAULT_FORM);
    setModalOpen(true);
  };

  const createFormError = editJobData ? null : validateNewJobForm(form);

  const buildPayload = (f: FormState) => {
    const splitCsv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
    const apiStatus = f.status === "Open" ? "OPEN" : f.status === "Paused" ? "PAUSED" : "CLOSED";
    const minYears = Number(f.minimumExperienceYears);
    const jobMetaPayload = {
      employmentType: f.employmentType, numberOfOpenings: Number(f.openings) || 1,
      roleSummary: f.roleSummary, keyResponsibilities: f.keyResponsibilities,
      requiredSkills: splitCsv(f.requiredSkills), preferredSkills: splitCsv(f.preferredSkills),
      resumeMatchThreshold: f.resumeMatchThreshold.trim() === "" ? null : Number(f.resumeMatchThreshold),
      experienceRequired: f.experienceRequired, pipelineStages: splitCsv(f.pipelineStages),
      salaryMin: f.salaryMin === "" ? null : Number(f.salaryMin),
      salaryMax: f.salaryMax === "" ? null : Number(f.salaryMax),
      currency: f.currency || null, budgetApprovalStatus: f.budgetApprovalStatus || null,
      education: f.education || null,
      minimumExperienceYears: f.minimumExperienceYears === "" ? null : Number(f.minimumExperienceYears),
      locationConstraints: f.locationConstraints || null,
      applicationDeadline: f.applicationDeadline || null,
      allowReferrals: !!f.allowReferrals, tags: splitCsv(f.tags),
    };
    return {
      title: f.title, department: f.dept, location: f.loc, status: apiStatus,
      ...jobMetaPayload, jobMeta: jobMetaPayload, description: f.roleSummary || null,
      additionalComments: null,
      yearsOfExperience: Number.isInteger(minYears) && minYears >= 0 ? minYears : null,
    };
  };

  const handleSave = async () => {
    setSaveError("");
    if (!editJobData) {
      const formErr = validateNewJobForm(form);
      if (formErr) { setSaveError(formErr); return; }
    } else if (!form.title?.trim()) {
      setSaveError("Job title is required."); return;
    }
    const payload = buildPayload(form);
    try {
      if (editJobData) {
        await updateJob.mutateAsync({ jobId: editJobData.id, payload });
        toast.success("Position updated.");
      } else {
        await createJob.mutateAsync(payload);
        toast.success("Position created.");
      }
      await refreshJobs();
      setModalOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setSaveError(msg);
      toast.error(msg);
    }
  };

  const copyApplyLink = async (jobId: string) => {
    const absoluteUrl = `${window.location.origin}/apply/${jobId}`;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopiedJobId(jobId);
      setTimeout(() => setCopiedJobId(""), 1500);
    } catch { setCopiedJobId(""); }
  };

  const openAssignModal = (job: Job) => {
    setAssignJob(job);
    setAssignModalOpen(true);
    setSelectedUserId("");
    setUserSearch("");
    setRoleFilter(isAdmin(role) ? "HIRING_MANAGER" : "RECRUITER");
  };

  const handleAddAssignment = async () => {
    if (!selectedUserId) return;
    try {
      await addAssignment.mutateAsync(selectedUserId);
      setSelectedUserId("");
      toast.success("Assignment added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assign failed");
    }
  };

  const handleRemoveAssignment = async (userId: string) => {
    try {
      await removeAssignment.mutateAsync(userId);
      toast.success("Assignment removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  const handleDelete = async (job: Job) => {
    if (!window.confirm("Are you sure you want to remove this position?")) return;
    try {
      await deleteJob.mutateAsync(job.id);
      await refreshJobs();
      toast.success("Position removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const openImportModal = () => {
    setImportModalOpen(true);
    setCsvFile(null);
    setImportResult(null);
    setImportError("");
  };

  const handleCsvPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setCsvFile(file);
    setImportResult(null);
    setImportError("");
  };

  const handleImportCsv = async () => {
    if (!csvFile) {
      setImportError("Choose a CSV file first.");
      return;
    }
    setImportError("");
    setImportResult(null);
    try {
      const result = await importJobs.mutateAsync(csvFile);
      setImportResult(result);
      await refreshJobs();
      if (result.created > 0 && result.failed === 0) {
        toast.success(`Imported ${result.created} position${result.created === 1 ? "" : "s"}.`);
      } else if (result.created > 0) {
        toast.success(`Imported ${result.created} of ${result.total} positions.`);
      } else {
        toast.error("No positions were imported. Check row errors below.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setImportError(msg);
      toast.error(msg);
    }
  };

  const filteredJobs = jobs.filter(
    (j) => j.title.toLowerCase().includes(q.toLowerCase()) ||
      j.department?.toLowerCase().includes(q.toLowerCase())
  );

  const isSaving = createJob.isPending || updateJob.isPending;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">Job Management</p>
          <h1 className="text-2xl font-bold tracking-tight">Open Positions</h1>
        </div>
        {allowCreateJob && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={openImportModal} className="gap-2 h-9 text-sm">
              <FileArrowUp data-icon="inline-start" />
              Import CSV
            </Button>
            <Button onClick={() => openFormModal()} className="gap-2 h-9 text-sm">
              <Plus data-icon="inline-start" />
              New Position
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex max-w-sm gap-2">
        <Input
          placeholder="Search positions…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {/* Jobs Grid */}
      <div className="grid gap-3">
        {filteredJobs.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No positions found.
          </div>
        )}
        {filteredJobs.map((job) => {
          const appCnt = job.applicantCount ?? (applicants as { jobId: string }[]).filter((a) => a.jobId === job.id).length;
          const statusVal = job.status === "OPEN" ? "Open" : job.status === "PAUSED" ? "Paused" : "Closed";

          return (
            <Card key={job.id} className="transition-all hover:border-muted-foreground/30 hover:shadow-sm">
              <CardContent className="flex flex-wrap justify-between items-center gap-6 p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Link href={`/jobs/${job.id}`} className="text-base font-semibold hover:underline">
                      {job.title}
                    </Link>
                    <Badge
                      variant={statusVal === "Open" ? "default" : statusVal === "Paused" ? "secondary" : "destructive"}
                      className="text-[10px] h-5 px-1.5 font-medium"
                    >
                      {statusVal}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Buildings className="size-3.5" />{job.department}</span>
                    <span className="flex items-center gap-1"><MapPin className="size-3.5" />{job.location}</span>
                    <span className="flex items-center gap-1"><Briefcase className="size-3.5" />{job.jobMeta?.employmentType || job.employmentType || "FULL_TIME"}</span>
                    <span className="flex items-center gap-1"><CurrencyDollar className="size-3.5" />{job.salary || "Not Specified"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 ml-auto flex-wrap">
                  <div className="text-center w-16">
                    <p className="text-xl font-bold text-primary tabular-nums">{appCnt}</p>
                    <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Applicants</p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/apply/${job.id}`} target="_blank" rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs font-semibold")}
                    >
                      Apply Link
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => copyApplyLink(job.id)} className="h-8 text-xs">
                      {copiedJobId === job.id ? <Check className="size-3.5 mr-1" /> : <Copy className="size-3.5 mr-1" />}
                      {copiedJobId === job.id ? "Copied" : "Copy"}
                    </Button>
                    {allowManageAssignments && (
                      <Button variant="ghost" size="sm" onClick={() => openAssignModal(job)} className="h-8 text-xs">
                        <UserPlus className="size-3.5 mr-1" />Assign
                      </Button>
                    )}
                    {allowEditJob && (
                      <Button variant="ghost" size="sm" onClick={() => openFormModal(job)} className="h-8 text-xs">
                        <Pencil className="size-3.5 mr-1" />Edit
                      </Button>
                    )}
                    {allowDeleteJob && (
                      <Button
                        key={job.id}
                        variant="ghost" size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(job)}
                        disabled={deleteJob.isPending}
                      >
                        {deleteJob.isPending ? <SpinnerGapIcon className="size-3.5 mr-1 animate-spin" /> : <Trash className="size-3.5 mr-1" />}
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* New/Edit Job Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{editJobData ? "Edit Position" : "New Position"}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[500px] pr-3">
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="job-title">Job Title *</Label>
                <Input id="job-title" value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder="e.g. Senior Software Engineer" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="job-dept">Department *</Label>
                <Select value={form.dept} onValueChange={(v) => updateForm({ dept: v })}>
                  <SelectTrigger id="job-dept"><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="job-loc">Location *</Label>
                <Select value={form.loc} onValueChange={(v) => updateForm({ loc: v })}>
                  <SelectTrigger id="job-loc"><SelectValue /></SelectTrigger>
                  <SelectContent>{LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="employment-type">Employment Type</Label>
                <Select value={form.employmentType} onValueChange={(v) => updateForm({ employmentType: v })}>
                  <SelectTrigger id="employment-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">Full-time</SelectItem>
                    <SelectItem value="INTERNSHIP">Internship</SelectItem>
                    <SelectItem value="CONTRACT">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="openings">Openings</Label>
                <Input id="openings" type="number" min={1} value={form.openings} onChange={(e) => updateForm({ openings: Number(e.target.value) })} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="role-summary">Role Summary *</Label>
                <Textarea id="role-summary" rows={3} value={form.roleSummary} onChange={(e) => updateForm({ roleSummary: e.target.value })} placeholder="Brief overview of the role" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="responsibilities">Key Responsibilities *</Label>
                <Textarea id="responsibilities" rows={3} value={form.keyResponsibilities} onChange={(e) => updateForm({ keyResponsibilities: e.target.value })} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="required-skills">Required Skills * <span className="text-muted-foreground">(comma-separated)</span></Label>
                <Input id="required-skills" value={form.requiredSkills} onChange={(e) => updateForm({ requiredSkills: e.target.value })} placeholder="React, TypeScript, Node.js" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="preferred-skills">Preferred Skills <span className="text-muted-foreground">(comma-separated)</span></Label>
                <Input id="preferred-skills" value={form.preferredSkills} onChange={(e) => updateForm({ preferredSkills: e.target.value })} placeholder="AWS, Docker, GraphQL" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="match-threshold">Resume Match Threshold (%)</Label>
                <Input id="match-threshold" type="number" min={0} max={100} value={form.resumeMatchThreshold} onChange={(e) => updateForm({ resumeMatchThreshold: e.target.value })} placeholder="e.g. 80" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exp-required">Experience Required *</Label>
                <Input id="exp-required" value={form.experienceRequired} onChange={(e) => updateForm({ experienceRequired: e.target.value })} placeholder="3-5 years" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="min-exp">Min Experience (years) *</Label>
                <Input id="min-exp" type="number" min={0} value={form.minimumExperienceYears} onChange={(e) => updateForm({ minimumExperienceYears: e.target.value })} placeholder="0 for entry level" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pipeline-stages">Pipeline Stages</Label>
                <Input id="pipeline-stages" value={form.pipelineStages} onChange={(e) => updateForm({ pipelineStages: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salary-min">Salary Min</Label>
                <Input id="salary-min" type="number" min={0} value={form.salaryMin} onChange={(e) => updateForm({ salaryMin: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salary-max">Salary Max</Label>
                <Input id="salary-max" type="number" min={0} value={form.salaryMax} onChange={(e) => updateForm({ salaryMax: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" value={form.currency} onChange={(e) => updateForm({ currency: e.target.value.toUpperCase() })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="education">Education</Label>
                <Input id="education" value={form.education} onChange={(e) => updateForm({ education: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deadline">Application Deadline</Label>
                <Input id="deadline" type="date" value={form.applicationDeadline} onChange={(e) => updateForm({ applicationDeadline: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="allow-referrals">Allow Referrals</Label>
                <Select value={form.allowReferrals ? "YES" : "NO"} onValueChange={(v) => updateForm({ allowReferrals: v === "YES" })}>
                  <SelectTrigger id="allow-referrals"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">Yes</SelectItem>
                    <SelectItem value="NO">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="tags">Tags <span className="text-muted-foreground">(comma-separated)</span></Label>
                <Input id="tags" value={form.tags} onChange={(e) => updateForm({ tags: e.target.value })} placeholder="urgent, remote, tech" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="job-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => updateForm({ status: v })}>
                  <SelectTrigger id="job-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Paused">Paused</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ScrollArea>

          {!editJobData && createFormError && (
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Required: title, location, role summary, required skills, and minimum experience (years).
            </p>
          )}
          {saveError && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription className="text-xs">{saveError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="mt-4 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={(!editJobData && !!createFormError) || isSaving}>
              {isSaving && <SpinnerGap className="size-3.5 mr-1 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {assignJob ? `Audit assignments — ${assignJob.title}` : "Audit assignments"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              For compliance only — does not grant job or data access.
            </p>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {isAdmin(role) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assign-role">Assign Role</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger id="assign-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HIRING_MANAGER">Hiring Manager</SelectItem>
                    <SelectItem value="RECRUITER">Recruiter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="search-user">Search User</Label>
              <Input id="search-user" placeholder="Type name or email…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="select-user">Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="select-user">
                  <SelectValue placeholder={usersQuery.isLoading ? "Loading users…" : "Select a user"} />
                </SelectTrigger>
                <SelectContent>
                  {(usersQuery.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleAddAssignment} disabled={!selectedUserId || addAssignment.isPending} size="sm" className="w-full">
              {addAssignment.isPending && <SpinnerGap className="size-3.5 mr-1 animate-spin" />}
              Add Assignment
            </Button>

            <div className="border-t pt-4">
              <Label className="block mb-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide">
                Current Assignments
              </Label>
              {assignmentsQuery.isLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                </div>
              ) : (assignmentsQuery.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No assignments</p>
              ) : (
                <ScrollArea className="max-h-[200px]">
                  <div className="flex flex-col gap-2">
                    {(assignmentsQuery.data ?? []).map((a) => (
                      <div key={a.id} className="flex justify-between items-center p-2.5 border rounded-lg bg-muted/20">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{a.user?.name || a.userId}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{a.user?.email} · {a.user?.role}</p>
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleRemoveAssignment(a.userId)}
                          disabled={removeAssignment.isPending}
                        >
                          {removeAssignment.isPending ? <SpinnerGap className="size-3 animate-spin" /> : "Remove"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignModalOpen(false)} className="w-full">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Import positions from CSV</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Upload a CSV with one job per row. Required columns:{" "}
              <span className="font-medium text-foreground">
                title, department, location, employmentType, roleSummary, keyResponsibilities,
                requiredSkills, experienceRequired, minimumExperienceYears
              </span>
              . Up to {JOB_CSV_MAX_ROWS} rows per file.
            </p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => downloadJobCsvTemplate()}
            >
              <DownloadSimple className="size-4" />
              Download template
            </Button>

            <div className="space-y-2">
              <Label htmlFor="jobs-csv-file">CSV file</Label>
              <Input
                id="jobs-csv-file"
                type="file"
                accept=".csv,text/csv"
                className="cursor-pointer file:cursor-pointer"
                disabled={importJobs.isPending}
                onChange={handleCsvPick}
              />
              {csvFile ? (
                <p className="text-xs text-muted-foreground">
                  Selected: {csvFile.name} ({Math.round(csvFile.size / 1024)} KB)
                </p>
              ) : null}
            </div>

            {importError ? (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{importError}</AlertDescription>
              </Alert>
            ) : null}

            {importResult ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">
                  {importResult.created} created · {importResult.failed} failed · {importResult.total} total
                </p>
                {importResult.results.some((r) => !r.success) ? (
                  <ScrollArea className="max-h-40">
                    <ul className="space-y-1 pr-2">
                      {importResult.results
                        .filter((r) => !r.success)
                        .map((r) => (
                          <li key={r.row} className="text-xs text-destructive">
                            Row {r.row} ({r.title}): {r.error}
                          </li>
                        ))}
                    </ul>
                  </ScrollArea>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter className="mt-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setImportModalOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => void handleImportCsv()}
              disabled={!csvFile || importJobs.isPending}
            >
              {importJobs.isPending ? (
                <>
                  <SpinnerGap className="size-3.5 mr-1 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
