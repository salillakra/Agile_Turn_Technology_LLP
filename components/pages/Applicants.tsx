"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { toast } from "sonner";
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
  Eye,
  UploadSimple,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  bulkUploadResumesForJob,
} from "@/lib/api/applicants";

/** Must match `BULK_RESUME_MAX_FILES` in `src/lib/bulk-resume-import.ts`. */
const BULK_RESUME_MAX_FILES = 100;

type ParseBatchProgress = {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  pending: number;
  left: number;
  candidates: Array<{
    candidateId: string;
    resumeUrl: string | null;
    resumeFileName: string | null;
    status: string | null;
    error: string | null;
  }>;
};

/** Survives modal close — drives list-row parse badges + compact banner. */
type BulkParseSession = {
  candidateIds: string[];
  /** candidateId → original upload file name */
  fileByCandidate: Record<string, string>;
};

function isParseTerminal(status: string | null | undefined): boolean {
  return (
    status === "COMPLETED" ||
    status === "PARTIAL" ||
    status === "FAILED" ||
    status === "DONE"
  );
}

function isParseBusy(status: string | null | undefined): boolean {
  return (
    status == null ||
    status === "PENDING" ||
    status === "PROCESSING"
  );
}

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
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkJobId, setBulkJobId] = useState("");
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkParseSession, setBulkParseSession] =
    useState<BulkParseSession | null>(null);
  const [bulkParseProgress, setBulkParseProgress] =
    useState<ParseBatchProgress | null>(null);
  const bulkDoneToastedRef = useRef(false);

  const refreshBulkParseProgress = useCallback(async (candidateIds: string[]) => {
    if (candidateIds.length === 0) {
      setBulkParseProgress(null);
      return;
    }
    try {
      const res = await fetch("/api/parse-progress/batch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds }),
      });
      const body = (await res.json().catch(() => null)) as ParseBatchProgress | null;
      if (res.ok && body) setBulkParseProgress(body);
    } catch {
      // next SSE/poll tick retries
    }
  }, []);

  const parseStatusByCandidate = useMemo(() => {
    const map = new Map<
      string,
      { status: string | null; error: string | null; resumeUrl: string | null }
    >();
    for (const row of bulkParseProgress?.candidates ?? []) {
      map.set(row.candidateId, {
        status: row.status,
        error: row.error,
        resumeUrl: row.resumeUrl,
      });
    }
    return map;
  }, [bulkParseProgress]);

  // Live parse tracking lives on the page (not inside the modal).
  useEffect(() => {
    if (!bulkParseSession?.candidateIds.length) {
      setBulkParseProgress(null);
      return;
    }
    const candidateIds = bulkParseSession.candidateIds;
    bulkDoneToastedRef.current = false;
    void refreshBulkParseProgress(candidateIds);

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed || typeof EventSource === "undefined") return;
      es = new EventSource("/api/parse-progress/stream");
      const onUpdate = () => {
        void refreshBulkParseProgress(candidateIds);
      };
      es.addEventListener("connected", onUpdate);
      es.addEventListener("parse-progress", onUpdate);
      es.onerror = () => {
        es?.close();
        es = null;
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };
    connect();

    const poll = window.setInterval(() => {
      void refreshBulkParseProgress(candidateIds);
    }, 2500);

    return () => {
      disposed = true;
      window.clearInterval(poll);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [bulkParseSession, refreshBulkParseProgress]);

  // When batch finishes: toast once, refresh list, keep badges briefly then clear.
  useEffect(() => {
    if (!bulkParseSession || !bulkParseProgress) return;
    if (bulkParseProgress.left > 0) return;
    if (bulkDoneToastedRef.current) return;
    bulkDoneToastedRef.current = true;
    const { completed, failed, total } = bulkParseProgress;
    if (failed > 0) {
      toast.message(`Resume parse finished`, {
        description: `${completed} of ${total} parsed · ${failed} failed`,
      });
    } else {
      toast.success(`All ${completed} resumes parsed`);
    }
    void onRefresh();
    const t = window.setTimeout(() => {
      setBulkParseSession(null);
      setBulkParseProgress(null);
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [bulkParseSession, bulkParseProgress, onRefresh]);

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

  const openBulkUpload = () => {
    setBulkJobId(jobs[0]?.id || jobQ || "");
    setBulkFiles([]);
    setBulkError("");
    if (bulkInputRef.current) bulkInputRef.current.value = "";
    setBulkModalOpen(true);
  };

  const handleBulkFilesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (list.length > BULK_RESUME_MAX_FILES) {
      setBulkError(`Select at most ${BULK_RESUME_MAX_FILES} resumes.`);
      setBulkFiles(list.slice(0, BULK_RESUME_MAX_FILES));
      return;
    }
    setBulkError("");
    setBulkFiles(list);
  };

  const submitBulkUpload = async () => {
    if (!bulkJobId.trim()) {
      setBulkError("Select an open position.");
      return;
    }
    if (bulkFiles.length === 0) {
      setBulkError("Select at least one resume (PDF, DOC, or DOCX).");
      return;
    }
    setBulkLoading(true);
    setBulkError("");
    try {
      const result = await bulkUploadResumesForJob(bulkJobId, bulkFiles);
      const fileByCandidate: Record<string, string> = {};
      const candidateIds: string[] = [];
      for (const r of result.results) {
        if (!r.success || !r.candidateId) continue;
        if (!fileByCandidate[r.candidateId]) {
          candidateIds.push(r.candidateId);
          fileByCandidate[r.candidateId] = r.fileName;
        }
      }

      if (candidateIds.length > 0) {
        setBulkParseSession({ candidateIds, fileByCandidate });
      }

      await onRefresh();
      window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));

      const jobTitle =
        jobs.find((j) => j.id === bulkJobId)?.title?.trim() || "position";
      toast.success(
        `Imported ${result.succeeded} resume${result.succeeded === 1 ? "" : "s"}`,
        {
          description:
            result.failed > 0
              ? `${result.failed} failed · parsing ${candidateIds.length} in the background for ${jobTitle}`
              : `Parsing ${candidateIds.length} in the background for ${jobTitle}`,
        },
      );

      setBulkModalOpen(false);
      setBulkFiles([]);
      if (bulkInputRef.current) bulkInputRef.current.value = "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk upload failed";
      setBulkError(msg);
      toast.error(msg);
    } finally {
      setBulkLoading(false);
    }
  };

  const openEdit = (a: any) => {
    setEditData(a);
    setForm(applicantToForm(a));
    setResumeFile(null);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
    setSaveError("");
    setModalOpen(true);
  };

  const uploadResumeForCandidate = async (candidateId: string) => {
    if (!resumeFile) return;
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
      const msg =
        e instanceof Error ? e.message : "Resume parse/match failed";
      setSaveError(msg);
      toast.error(msg);
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

        if (resumeFile) {
          await uploadResumeForCandidate(candidateId);
        }

        setModalOpen(false);
        setEditData(null);
        await onRefresh();
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
        toast.success("Applicant updated");
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
      toast.success(editData ? "Applicant updated" : "Applicant added");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setSaveError(msg);
      toast.error(msg);
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
      toast.success("Application withdrawn");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remove failed";
      setDeleteError(msg);
      toast.error(msg);
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

  // Guard against duplicate application rows (React key collisions).
  const visibleApplicants = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof filteredApplicants = [];
    for (const a of filteredApplicants) {
      const id = typeof a?.id === "string" ? a.id : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(a);
    }
    return out;
  }, [filteredApplicants]);

  const bulkJobTitle = useMemo(
    () => jobs.find((j) => j.id === bulkJobId)?.title?.trim() || "",
    [jobs, bulkJobId],
  );

  useEffect(() => {
    if (!deepLinkTarget || visibleApplicants.length === 0) return;
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
    visibleApplicants,
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={openBulkUpload}
              className="gap-2 h-9 text-sm"
            >
              <UploadSimple className="size-4" />
              Bulk upload resumes
            </Button>
            <Button onClick={openAdd} className="gap-2 h-9 text-sm">
              <Plus className="size-4" />
              Add Applicant
            </Button>
          </div>
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
        {bulkParseSession && bulkParseProgress ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="min-w-0 flex flex-1 flex-col gap-1.5">
              <p className="text-sm font-medium">
                Parsing resumes
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {bulkParseProgress.completed + bulkParseProgress.failed}/
                  {bulkParseProgress.total} done
                  {bulkParseProgress.left > 0
                    ? ` · ${bulkParseProgress.left} left`
                    : ""}
                  {bulkParseProgress.failed > 0
                    ? ` · ${bulkParseProgress.failed} failed`
                    : ""}
                </span>
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${
                      bulkParseProgress.total === 0
                        ? 0
                        : Math.round(
                            ((bulkParseProgress.completed +
                              bulkParseProgress.failed) /
                              bulkParseProgress.total) *
                              100,
                          )
                    }%`,
                  }}
                />
              </div>
            </div>
            {bulkParseProgress.left === 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setBulkParseSession(null);
                  setBulkParseProgress(null);
                }}
              >
                Dismiss
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowsClockwise className="size-3.5 animate-spin" />
                Live
              </span>
            )}
          </div>
        ) : null}

        {drillDownLoading ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Loading drilldown candidates...
          </div>
        ) : visibleApplicants.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No applicants matching criteria.
          </div>
        ) : (
          visibleApplicants.map((a) => {
            const isHighlighted =
              (applicationQ && a.id === applicationQ) ||
              (!applicationQ && candidateQ && a.candidateId === candidateQ);
            const parseRow =
              typeof a.candidateId === "string"
                ? parseStatusByCandidate.get(a.candidateId)
                : undefined;
            const tracked =
              typeof a.candidateId === "string" &&
              Boolean(bulkParseSession?.candidateIds.includes(a.candidateId));
            const parseBusy = tracked && (parseRow ? isParseBusy(parseRow.status) : true);
            const parseFailed = tracked && parseRow?.status === "FAILED";
            const parseDone =
              tracked &&
              parseRow != null &&
              isParseTerminal(parseRow.status) &&
              !parseFailed;

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
                      {parseBusy ? (
                        <Badge
                          variant="secondary"
                          className="normal-case tracking-normal"
                        >
                          <ArrowsClockwise className="size-3 animate-spin" />
                          Parsing resume
                        </Badge>
                      ) : null}
                      {parseDone ? (
                        <Badge
                          variant="outline"
                          className="normal-case tracking-normal"
                        >
                          Parsed
                        </Badge>
                      ) : null}
                      {parseFailed ? (
                        <Badge
                          variant="destructive"
                          className="normal-case tracking-normal"
                          title={parseRow?.error ?? undefined}
                        >
                          Parse failed
                        </Badge>
                      ) : null}
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
                    {canReadResume(role) && parseRow?.resumeUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(
                            parseRow.resumeUrl!,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                        className="h-8 text-xs"
                      >
                        <Eye className="size-3.5 mr-1" />
                        Open
                      </Button>
                    ) : null}
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

      {/* Bulk resume import — upload only; parse progress lives on the list */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Bulk upload resumes</DialogTitle>
            <DialogDescription>
              Upload up to {BULK_RESUME_MAX_FILES} PDF/DOC/DOCX files. After import,
              each row shows live parse status on the applicants list.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-job">Position *</Label>
              <Select
                value={bulkJobId}
                onValueChange={setBulkJobId}
                disabled={bulkLoading}
              >
                <SelectTrigger id="bulk-job" className="w-full min-w-0">
                  <SelectValue placeholder="Select position">
                    {bulkJobTitle || undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {jobs
                    .filter(
                      (j) =>
                        j.id === bulkJobId ||
                        !j.status ||
                        String(j.status).toUpperCase() === "OPEN",
                    )
                    .map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-resumes">Resume files *</Label>
              <Input
                ref={bulkInputRef}
                id="bulk-resumes"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                className="cursor-pointer file:cursor-pointer"
                disabled={bulkLoading}
                onChange={handleBulkFilesPick}
              />
              {bulkFiles.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {bulkFiles.length} file{bulkFiles.length === 1 ? "" : "s"}{" "}
                  selected
                  {" · "}
                  {Math.round(
                    bulkFiles.reduce((sum, f) => sum + f.size, 0) / 1024,
                  )}{" "}
                  KB total
                </p>
              ) : null}
            </div>

            {bulkError ? (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{bulkError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bulkLoading}
              onClick={() => setBulkModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={bulkLoading || bulkFiles.length === 0 || !bulkJobId}
              onClick={() => void submitBulkUpload()}
              className="gap-2"
            >
              {bulkLoading ? (
                <ArrowsClockwise className="size-4 animate-spin" />
              ) : (
                <UploadSimple className="size-4" />
              )}
              {bulkLoading
                ? "Importing…"
                : `Import ${bulkFiles.length || ""} resume${bulkFiles.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

              <div className="space-y-3 border-y py-3 sm:col-span-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="resume-upload" className="font-semibold">
                      Upload resume{" "}
                      {!editData ? (
                        <span className="text-destructive font-normal">(required for new)</span>
                      ) : (
                        <span className="text-muted-foreground font-normal">(optional replace)</span>
                      )}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      PDF, DOC, or DOCX. After upload you can parse skills and score job match.
                    </p>
                    <input
                      ref={resumeInputRef}
                      id="resume-upload"
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      disabled={saveLoading}
                      onChange={(e) =>
                        setResumeFile(e.target.files?.[0] ?? null)
                      }
                      className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-primary file:cursor-pointer"
                    />
                    {resumeFile && (
                      <p className="text-[11px] font-medium text-foreground truncate">
                        Selected: {resumeFile.name}
                      </p>
                    )}
                  </div>
                  {!editData && (
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
                  )}

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
