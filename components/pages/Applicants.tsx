"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { mapApplicationsApiRowToApplicantItem } from "@/src/lib/applications-drilldown-ui";
import {
  STAGES,
  SOURCES,
  STAGE_META,
  STAGE_LABEL_TO_API,
  SOURCE_LABEL_TO_API,
} from "@/data/mockData";
import {
  canCreateCandidate,
  canEditCandidate,
  canDeleteCandidate,
  canReadResume,
} from "@/src/lib/rbac";
import ResumeCandidateModal from "@/components/ResumeCandidateModal";
import RecommendedRolesPanel from "@/components/RecommendedRolesPanel";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/components/NotificationBell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import StarRating from "@/components/ui/StarRating";
import StageBadge from "@/components/ui/StageBadge";
import InterviewTimeline from "@/components/InterviewTimeline";
import {
  Star,
  FileText,
  Calendar,
  Trash,
  Pencil,
  Warning,
  Plus,
  MagnifyingGlass,
  ArrowsClockwise,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface ApplicantsProps {
  applicants: any[];
  setApplicants: React.Dispatch<React.SetStateAction<any[]>>;
  jobs: any[];
  onRefresh: () => Promise<void>;
}

export default function Applicants({
  applicants,
  setApplicants,
  jobs,
  onRefresh,
}: ApplicantsProps) {
  const searchParams = useSearchParams();
  const stageQ = searchParams.get("stage")?.trim() || "";
  const sourceQ = searchParams.get("source")?.trim() || "";
  const jobQ = searchParams.get("jobId")?.trim() || "";
  const applicationQ = searchParams.get("applicationId")?.trim() || "";
  const candidateQ = searchParams.get("candidateId")?.trim() || "";
  const deepLinkTarget = applicationQ || candidateQ;

  const [drillDownRows, setDrillDownRows] = useState<any[] | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownErr, setDrillDownErr] = useState<string | null>(null);

  const drillDeps = useMemo(
    () => [stageQ, sourceQ, jobQ].join("|"),
    [stageQ, sourceQ, jobQ],
  );

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

  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const [fJob, setFJob] = useState("");
  const [fStage, setFStage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    jobId: jobs[0]?.id || "",
    source: "LinkedIn",
    stage: "Applied",
    rating: 3,
    notes: "",
    tags: "",
  });

  const [resumeModal, setResumeModal] = useState<{
    open: boolean;
    candidateId: string | undefined;
    name: string;
  }>({
    open: false,
    candidateId: undefined,
    name: "",
  });

  const [saveError, setSaveError] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [matchState, setMatchState] = useState<{
    status: string;
    score: any;
    msg: string;
  }>({
    status: "idle",
    score: null,
    msg: "",
  });
  const [draftCandidateId, setDraftCandidateId] = useState("");
  const [recommendationsRefreshKey, setRecommendationsRefreshKey] = useState(0);
  const [parseProfileApplied, setParseProfileApplied] = useState(false);
  const [interviewPanelAppId, setInterviewPanelAppId] = useState("");
  const [interviewRefreshKey, setInterviewRefreshKey] = useState(0);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const updateForm = (fields: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...fields }));
  };

  function applicantToForm(a: {
    name?: string;
    email?: string;
    phone?: string;
    jobId?: string;
    source?: string;
    stage?: string;
    rating?: number;
    notes?: string;
    tags?: string[] | string;
  }) {
    return {
      name: a.name ?? "",
      email: a.email ?? "",
      phone: a.phone ?? "",
      jobId: a.jobId ?? jobs[0]?.id ?? "",
      source: a.source ?? "LinkedIn",
      stage: a.stage ?? "Applied",
      rating: typeof a.rating === "number" ? a.rating : 3,
      notes: a.notes ?? "",
      tags: Array.isArray(a.tags) ? a.tags.join(", ") : a.tags ?? "",
    };
  }

  const positionJobOptions = useMemo(() => {
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const jobId = form.jobId?.trim();
    if (jobId && !byId.has(jobId)) {
      byId.set(jobId, {
        id: jobId,
        title: editData?.jobTitle ?? "Selected position",
        department: editData?.dept ?? "",
      });
    }
    return [...byId.values()];
  }, [jobs, form.jobId, editData?.jobTitle, editData?.dept]);

  const selectedJobTitle =
    positionJobOptions.find((j) => j.id === form.jobId)?.title ??
    editData?.jobTitle ??
    "Select position";

  const openAdd = () => {
    setEditData(null);
    setForm({
      name: "",
      email: "",
      phone: "",
      jobId: jobs[0]?.id || "",
      source: "LinkedIn",
      stage: "Applied",
      rating: 3,
      notes: "",
      tags: "",
    });
    setResumeFile(null);
    setMatchState({ status: "idle", score: null, msg: "" });
    setDraftCandidateId("");
    setRecommendationsRefreshKey(0);
    setParseProfileApplied(false);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
    setModalOpen(true);
  };

  const openEdit = (a: any) => {
    setEditData(a);
    setForm(applicantToForm(a));
    setSaveError("");
    setModalOpen(true);
  };

  const computeMatchForNewCandidate = async (
    candidateId: string,
    jobId: string,
  ) => {
    setMatchState({
      status: "working",
      score: null,
      msg: "Uploading resume & parsing…",
    });
    if (!resumeFile)
      throw new Error("Please select a resume file before saving.");

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
    const uploadBody = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      throw new Error(
        uploadBody?.message ||
          uploadBody?.error ||
          `Resume upload failed (${uploadRes.status})`,
      );
    }

    const parseRes = await fetch(
      `/api/candidates/${encodeURIComponent(candidateId)}/resume/parse`,
      {
        method: "POST",
        credentials: "same-origin",
      },
    );
    const parseBody = await parseRes.json().catch(() => ({}));
    if (!parseRes.ok) {
      throw new Error(
        parseBody?.message ||
          parseBody?.error ||
          `Parse enqueue failed (${parseRes.status})`,
      );
    }

    const startedAt = Date.now();
    let delay = 800;
    let latest = null;
    while (Date.now() - startedAt < 60_000) {
      const stRes = await fetch(
        `/api/candidates/${encodeURIComponent(candidateId)}/parse-status`,
        {
          credentials: "same-origin",
        },
      );
      const stBody = await stRes.json().catch(() => ({}));
      if (!stRes.ok) {
        throw new Error(
          stBody?.message ||
            stBody?.error ||
            `Parse status failed (${stRes.status})`,
        );
      }
      latest = stBody;
      const status = stBody?.status;
      if (status === "COMPLETED" || status === "FAILED") break;
      setMatchState({
        status: "working",
        score: null,
        msg: `Parsing resume… (${String(status || "PENDING")})`,
      });
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(5000, Math.round(delay * 1.4));
    }

    if (!latest || latest.status !== "COMPLETED") {
      const msg =
        latest?.status === "FAILED"
          ? String(latest?.error || "Parse failed")
          : "Parse did not complete in time.";
      throw new Error(msg);
    }

    setMatchState({
      status: "working",
      score: null,
      msg: "Applying parsed skills…",
    });
    const applyRes = await fetch(
      `/api/candidates/${encodeURIComponent(candidateId)}/resume/parse/apply`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeParseJobId: latest.resumeParseJobId,
          result: latest.result,
        }),
      },
    );
    const applyBody = await applyRes.json().catch(() => ({}));
    if (!applyRes.ok) {
      throw new Error(
        applyBody?.message ||
          applyBody?.error ||
          `Apply parse failed (${applyRes.status})`,
      );
    }
    setParseProfileApplied(true);
    setRecommendationsRefreshKey((k) => k + 1);

    setMatchState({
      status: "working",
      score: null,
      msg: "Computing match score…",
    });
    const scoreRes = await fetch(
      `/api/jobs/${encodeURIComponent(jobId)}/resume-match?candidateId=${encodeURIComponent(candidateId)}`,
      { credentials: "same-origin" },
    );
    const scoreBody = await scoreRes.json().catch(() => ({}));
    if (!scoreRes.ok) {
      throw new Error(
        scoreBody?.message ||
          scoreBody?.error ||
          `Score failed (${scoreRes.status})`,
      );
    }

    setMatchState({
      status: scoreBody?.eligible === true ? "eligible" : "blocked",
      score: scoreBody,
      msg:
        scoreBody?.eligible === true
          ? "Eligible — you can apply."
          : "Not eligible for this role.",
    });
    return scoreBody;
  };

  const jobForSelected = useMemo(
    () => jobs.find((j) => j.id === form.jobId),
    [jobs, form.jobId],
  );
  const jobMetaForSelected = jobForSelected?.jobMeta || null;
  const thresholdForSelected =
    jobMetaForSelected?.resumeMatchThreshold === null ||
    jobMetaForSelected?.resumeMatchThreshold === undefined ||
    jobMetaForSelected?.resumeMatchThreshold === ""
      ? null
      : Number(jobMetaForSelected.resumeMatchThreshold);
  const requiredSkillsCountForSelected = Array.isArray(
    jobMetaForSelected?.requiredSkills,
  )
    ? jobMetaForSelected.requiredSkills.length
    : 0;
  const thresholdIsConfigured =
    thresholdForSelected != null &&
    Number.isFinite(thresholdForSelected) &&
    thresholdForSelected > 0 &&
    requiredSkillsCountForSelected > 0;

  const parseAndMatchNow = async () => {
    setSaveError("");
    if (!form.name || !form.email || !form.phone || !form.jobId) {
      setSaveError(
        "Name, email, phone, and position are required before parsing.",
      );
      return;
    }
    if (!resumeFile) {
      setSaveError("Please select a resume file.");
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
          throw new Error(
            candidateBody?.message ||
              candidateBody?.error ||
              `Candidate create failed (${candidateRes.status})`,
          );
        }
        candidateId = candidateBody.id;
        setDraftCandidateId(candidateId);
      }
      await computeMatchForNewCandidate(candidateId, form.jobId);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Resume parse/match failed",
      );
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.jobId) return;
    setSaveError("");
    setSaveLoading(true);

    const readApiError = async (res: Response, fallback: string) => {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { message?: string; error?: string })?.message ||
          (body as { message?: string; error?: string })?.error ||
          `${fallback} (${res.status})`,
      );
    };

    try {
      if (editData) {
        const applicationId = editData.id as string;
        const candidateId = editData.candidateId as string | undefined;
        if (!applicationId) {
          throw new Error("Missing application id");
        }
        if (!candidateId) {
          throw new Error("Missing candidate id for this application");
        }

        const candidateRes = await fetch(
          `/api/candidates/${encodeURIComponent(candidateId)}`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidateName: form.name.trim(),
              email: form.email.trim(),
              contactNumber: form.phone?.trim() || null,
              candidateSource: SOURCE_LABEL_TO_API[form.source] ?? "OTHER",
            }),
          },
        );
        if (!candidateRes.ok) {
          await readApiError(candidateRes, "Candidate update failed");
        }

        if (form.jobId !== editData.jobId) {
          const jobRes = await fetch(
            `/api/applications/${encodeURIComponent(applicationId)}`,
            {
              method: "PATCH",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId: form.jobId }),
            },
          );
          if (!jobRes.ok) {
            await readApiError(jobRes, "Position update failed");
          }
        }

        if (form.stage !== editData.stage) {
          const stageApi = STAGE_LABEL_TO_API[form.stage] ?? "APPLIED";
          const stageRes = await fetch(
            `/api/applications/${encodeURIComponent(applicationId)}/stage`,
            {
              method: "PATCH",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ stage: stageApi }),
            },
          );
          if (!stageRes.ok) {
            await readApiError(stageRes, "Stage update failed");
          }
        }

        const notesValue = form.notes?.trim() || null;
        const prevNotes = (editData.notes ?? "").trim() || null;
        if (notesValue !== prevNotes) {
          const notesRes = await fetch(
            `/api/applications/${encodeURIComponent(applicationId)}/notes`,
            {
              method: "PATCH",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ notes: notesValue }),
            },
          );
          if (!notesRes.ok) {
            await readApiError(notesRes, "Notes update failed");
          }
        }

        const prevRating =
          typeof editData.rating === "number" ? editData.rating : null;
        if (form.rating !== prevRating) {
          const ratingRes = await fetch(
            `/api/applications/${encodeURIComponent(applicationId)}/feedback`,
            {
              method: "PATCH",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                rating: form.rating >= 1 ? form.rating : null,
              }),
            },
          );
          if (!ratingRes.ok) {
            await readApiError(ratingRes, "Rating update failed");
          }
        }

        setModalOpen(false);
        setEditData(null);
        await onRefresh();
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
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
          throw new Error(
            candidateBody?.message ||
              candidateBody?.error ||
              `Candidate create failed (${candidateRes.status})`,
          );
        }
        candidateId = candidateBody.id;
        setDraftCandidateId(candidateId);
      }

      if (thresholdIsConfigured && matchState?.score?.eligible !== true) {
        throw new Error("Please parse resume & compute match before saving.");
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
        throw new Error(
          appBody?.message ||
            appBody?.error ||
            `Application create failed (${appRes.status})`,
        );
      }

      setModalOpen(false);
      setDraftCandidateId("");
      await onRefresh();
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveLoading(false);
    }
  };

  const del = async (application: any) => {
    if (!application?.id || !allowDelete) return;
    setDeleteError("");
    setDeleteLoadingId(application.id);
    try {
      const res = await fetch(
        `/api/applications/${encodeURIComponent(application.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ withdrawnReason: "Removed from pipeline" }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.message || body?.error || `Remove failed (${res.status})`,
        );
      }
      setApplicants((prev) => prev.filter((a) => a.id !== application.id));
      await onRefresh();
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setDeleteLoadingId("");
    }
  };

  const baseApplicants = deepLinkTarget
    ? applicants
    : drillDownRows !== null
      ? drillDownRows
      : applicants;
  const filteredApplicants = baseApplicants.filter((a) => {
    const matchQ =
      !q ||
      a.name.toLowerCase().includes(q.toLowerCase()) ||
      (a.email && a.email.toLowerCase().includes(q.toLowerCase()));
    const matchJob = !fJob || a.jobId === fJob;
    const matchStage = !fStage || a.stage === fStage;
    return matchQ && matchJob && matchStage;
  });

  useEffect(() => {
    if (!deepLinkTarget || filteredApplicants.length === 0) return;
    const selector = applicationQ
      ? `[data-application-id="${applicationQ.replace(/"/g, '\\"')}"]`
      : `[data-candidate-id="${candidateQ.replace(/"/g, '\\"')}"]`;
    const el = document.querySelector(selector);
    if (el) {
      requestAnimationFrame(() =>
        el.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    }
  }, [
    deepLinkTarget,
    applicationQ,
    candidateQ,
    filteredApplicants,
    applicants,
    drillDownRows,
  ]);

  useEffect(() => {
    if (applicationQ) setInterviewPanelAppId(applicationQ);
  }, [applicationQ]);

  const timelineApplicationId = interviewPanelAppId || applicationQ || "";

  return (
    <div className="flex flex-col gap-6">
      {/* Filters from Analytics */}
      {(stageQ || sourceQ || jobQ) && (
        <Alert>
          <AlertDescription className="flex items-center justify-between text-xs">
            <span>
              Filtered analytics: {stageQ ? `stage=${stageQ}` : ""}
              {stageQ && (sourceQ || jobQ) ? " · " : ""}
              {sourceQ ? `source=${sourceQ}` : ""}
              {(stageQ || sourceQ) && jobQ ? " · " : ""}
              {jobQ ? `jobId=${jobQ}` : ""}
            </span>
            <Link
              href="/applicants"
              className={cn(
                buttonVariants({ variant: "link", size: "sm" }),
                "h-auto p-0",
              )}
            >
              Clear filters
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            Applicants
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Active Pipeline</h1>
        </div>
        {allowCreate && (
          <Button onClick={openAdd} className="gap-2 h-9 text-sm">
            <Plus className="size-4" />
            Add Applicant
          </Button>
        )}
      </div>

      {/* Toolbar filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-[240px]">
          <MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Select value={fJob} onValueChange={setFJob}>
          <SelectTrigger className="w-[180px] h-9 text-sm">
            <SelectValue placeholder="All Jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Jobs</SelectItem>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={fStage} onValueChange={setFStage}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Embedded Interview Timeline */}
      {timelineApplicationId && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <InterviewTimeline
            applicationId={timelineApplicationId}
            enabled
            refreshKey={interviewRefreshKey}
            compact={!interviewPanelAppId && !applicationQ}
          />
        </Card>
      )}

      {/* Applicants List */}
      <div className="grid gap-2">
        {drillDownLoading ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Loading drilldown candidates...
          </div>
        ) : filteredApplicants.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No applicants matching criteria.
          </div>
        ) : (
          filteredApplicants.map((a) => {
            const isHighlighted =
              (applicationQ && a.id === applicationQ) ||
              (!applicationQ && candidateQ && a.candidateId === candidateQ);

            return (
              <Card
                key={a.id}
                data-application-id={a.id}
                data-candidate-id={a.candidateId ?? ""}
                className={cn(
                  "transition-all hover:border-muted-foreground/30",
                  isHighlighted && "ring-2 ring-primary border-primary",
                )}
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {a.name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {a.email}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground flex-wrap">
                      <StageBadge stage={a.stage} />
                      <StarRating value={a.rating} />
                      <span className="font-medium text-primary/80">
                        {a.jobTitle}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {canReadResume(role) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setResumeModal({
                            open: true,
                            candidateId: a.candidateId,
                            name: a.name,
                          })
                        }
                        className="h-8 text-xs"
                      >
                        <FileText className="size-3.5 mr-1" />
                        resume
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInterviewPanelAppId((prev) =>
                          prev === a.id ? "" : a.id,
                        );
                        setInterviewRefreshKey((k) => k + 1);
                      }}
                      className="h-8 text-xs"
                    >
                      <Calendar className="size-3.5 mr-1" />
                      {interviewPanelAppId === a.id
                        ? "Hide Interviews"
                        : "Interviews"}
                    </Button>
                    {allowEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(a)}
                        className="h-8 text-xs"
                      >
                        <Pencil className="size-3.5 mr-1.5" />
                        Edit
                      </Button>
                    )}
                    {allowDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirmDelete(a)}
                      >
                        <Trash className="size-3.5 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              Confirm candidate removal
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will withdraw the application and archive it from active
              pipeline views.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-destructive/10 text-destructive text-xs">
            <Warning className="size-4 shrink-0" />
            <span>Are you sure you want to remove {confirmDelete?.name}?</span>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                const a = confirmDelete;
                setConfirmDelete(null);
                if (a) void del(a);
              }}
            >
              Confirm Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resume Modal */}
      {resumeModal.open && (
        <ResumeCandidateModal
          open={resumeModal.open}
          onClose={() => setResumeModal((m) => ({ ...m, open: false }))}
          candidateId={resumeModal.candidateId}
          candidateName={resumeModal.name}
          userRole={role}
        />
      )}

      {/* Add / Edit Form Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editData ? "Edit Applicant" : "Add Applicant"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[min(70vh,520px)] pr-2">
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="c-name">Full Name *</Label>
                <Input
                  id="c-name"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm({ email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input
                  id="c-phone"
                  value={form.phone}
                  onChange={(e) => updateForm({ phone: e.target.value })}
                  placeholder="+91..."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-source">Source</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => updateForm({ source: v })}
                >
                  <SelectTrigger id="c-source" className="w-full min-w-0">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-pos">Position *</Label>
                <Select
                  value={form.jobId}
                  onValueChange={(v) => updateForm({ jobId: v })}
                >
                  <SelectTrigger id="c-pos" className="w-full min-w-0">
                    <SelectValue placeholder="Select position">
                      {selectedJobTitle}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {positionJobOptions.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-stage">Pipeline Stage</Label>
                <Select
                  value={form.stage}
                  onValueChange={(v) => updateForm({ stage: v })}
                >
                  <SelectTrigger id="c-stage" className="w-full min-w-0">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!editData && (
                <div className="space-y-3 border-y py-3 sm:col-span-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="resume-upload" className="font-semibold">
                      Upload resume
                    </Label>
                    <input
                      ref={resumeInputRef}
                      id="resume-upload"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      disabled={saveLoading}
                      onChange={(e) =>
                        setResumeFile(e.target.files?.[0] ?? null)
                      }
                      className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-primary file:cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={saveLoading || !resumeFile}
                      onClick={parseAndMatchNow}
                    >
                      {matchState.status === "working" ? (
                        <ArrowsClockwise className="size-3.5 mr-1.5 animate-spin" />
                      ) : null}
                      Parse & Score Match
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      {thresholdIsConfigured
                        ? `Req threshold: ${thresholdForSelected}%`
                        : "No match threshold"}
                    </span>
                  </div>

                  {matchState.msg && (
                    <p className="text-[10px] font-medium text-muted-foreground">
                      {matchState.msg}
                    </p>
                  )}
                  {matchState.score && (
                    <div className="flex gap-2">
                      <Badge
                        variant={
                          matchState.score.eligible ? "default" : "destructive"
                        }
                      >
                        Match: {matchState.score.matchPercent}%
                      </Badge>
                      <Badge
                        variant={
                          matchState.score.eligible ? "outline" : "destructive"
                        }
                      >
                        {matchState.score.eligible
                          ? "Eligible"
                          : "Not Eligible"}
                      </Badge>
                    </div>
                  )}

                  {draftCandidateId && parseProfileApplied && (
                    <div className="mt-3 bg-muted/30 p-2.5 rounded-lg border">
                      <RecommendedRolesPanel
                        candidateId={draftCandidateId}
                        enabled
                        refreshKey={recommendationsRefreshKey}
                        userRole={role}
                        onApplied={async () => {
                          await onRefresh();
                          window.dispatchEvent(
                            new CustomEvent(NOTIFICATIONS_REFRESH_EVENT),
                          );
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Rating</Label>
                <StarRating
                  value={form.rating}
                  onChange={(v: number) => updateForm({ rating: v })}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="c-notes">Interview Notes / Review</Label>
                <Textarea
                  id="c-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => updateForm({ notes: e.target.value })}
                  placeholder="Enter initial interview notes..."
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="c-tags">
                  Tags{" "}
                  <span className="text-muted-foreground">
                    (comma-separated)
                  </span>
                </Label>
                <Input
                  id="c-tags"
                  value={form.tags}
                  onChange={(e) => updateForm({ tags: e.target.value })}
                  placeholder="e.g. backend, node, contract"
                />
              </div>
            </div>
          </ScrollArea>

          {saveError && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                {saveError}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                saveLoading ||
                (!editData &&
                  thresholdIsConfigured &&
                  matchState?.score?.eligible !== true)
              }
            >
              {saveLoading ? "Saving…" : "Save Candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
