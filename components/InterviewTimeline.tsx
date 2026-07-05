"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import StatusBadge from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { T } from "@/lib/helpers";
import { canEditCandidate } from "@/src/lib/rbac";

const RECOMMENDATION_OPTIONS = [
  { value: "STRONG_HIRE", label: "Strong hire" },
  { value: "HIRE", label: "Hire" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "NO_HIRE", label: "No hire" },
  { value: "STRONG_NO_HIRE", label: "Strong no hire" },
];

const INTERVIEWER_ROLE_OPTIONS = [
  { value: "TECHNICAL_INTERVIEWER", label: "Technical interviewer" },
  { value: "HIRING_MANAGER", label: "Hiring manager" },
  { value: "HR_INTERVIEWER", label: "HR interviewer" },
];

const STATUS_META = {
  SCHEDULED: { label: "Scheduled", color: "#60A5FA", bg: "rgba(96,165,250,.12)" },
  RESCHEDULED: { label: "Rescheduled", color: "#A78BFA", bg: "rgba(167,139,250,.12)" },
  COMPLETED: { label: "Completed", color: "#34D399", bg: "rgba(52,211,153,.12)" },
  CANCELLED: { label: "Cancelled", color: "#9CA3AF", bg: "rgba(156,163,175,.12)" },
  NO_SHOW: { label: "No show", color: "#FCA5A5", bg: "rgba(248,113,113,.12)" },
};

const RECOMMENDATION_META = {
  STRONG_HIRE: { label: "Strong hire", color: "#34D399", bg: "rgba(52,211,153,.12)" },
  HIRE: { label: "Hire", color: "#6EE7B7", bg: "rgba(110,231,183,.12)" },
  NEUTRAL: { label: "Neutral", color: "#FBBF24", bg: "rgba(251,191,36,.12)" },
  NO_HIRE: { label: "No hire", color: "#FCA5A5", bg: "rgba(248,113,113,.12)" },
  STRONG_NO_HIRE: { label: "Strong no hire", color: "#F87171", bg: "rgba(248,113,113,.18)" },
};

function formatRecommendation(value) {
  return RECOMMENDATION_META[value]?.label ?? value ?? "—";
}

function interviewEndMs(scheduledAtIso, durationMinutes) {
  const start = new Date(scheduledAtIso).getTime();
  return start + (durationMinutes || 0) * 60_000;
}

function hasInterviewEnded(row) {
  return interviewEndMs(row.scheduledAt, row.durationMinutes) <= Date.now();
}

function toDatetimeLocalValue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatWhen(iso, durationMinutes) {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return "—";
  const end = new Date(interviewEndMs(iso, durationMinutes));
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateFmt.format(start)} · ${timeFmt.format(start)} – ${timeFmt.format(end)} (${durationMinutes}m)`;
}

function roleLabel(role) {
  if (role === "TECHNICAL_INTERVIEWER") return "Technical";
  if (role === "HIRING_MANAGER") return "Hiring manager";
  if (role === "HR_INTERVIEWER") return "HR";
  return role;
}

function OptionSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const selectable = options.filter((option) => option.value !== "");
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {selectable.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TimelineDot({ color, active }) {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        flexShrink: 0,
        marginTop: 4,
        background: active ? color : "var(--app-border-strong)",
        boxShadow: active ? `0 0 0 3px ${color}33` : "none",
      }}
    />
  );
}

function FeedbackSummaryBlock({ decision }) {
  if (!decision) return null;
  const { feedbackCount, pendingFeedbackCount, averageRating, overallRecommendation, confidence, feedbackSummary } =
    decision;
  const recMeta = overallRecommendation ? RECOMMENDATION_META[overallRecommendation] : null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,.03)",
        border: "1px solid var(--app-border-strong)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <span style={{ ...T.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Panel summary
        </span>
        {recMeta ? (
          <StatusBadge label={recMeta.label} color={recMeta.color} bg={recMeta.bg} />
        ) : (
          <span style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)" }}>No consensus yet</span>
        )}
        {typeof averageRating === "number" ? (
          <span style={{ ...T.mono, fontSize: 11, color: "#FBBF24" }}>
            Avg rating {averageRating}/5
          </span>
        ) : null}
        <span style={{ ...T.mono, fontSize: 10, color: "var(--text-muted)" }}>
          {feedbackCount} submitted · {pendingFeedbackCount} pending · {confidence} confidence
        </span>
      </div>
      {feedbackSummary?.strengths?.length > 0 ? (
        <div style={{ marginBottom: 6 }}>
          <p style={{ ...T.mono, margin: "0 0 4px", fontSize: 10, color: "#34D399" }}>Strengths</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-body)" }}>
            {feedbackSummary.strengths.slice(0, 5).map((line, i) => (
              <li key={`s-${i}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {feedbackSummary?.weaknesses?.length > 0 ? (
        <div>
          <p style={{ ...T.mono, margin: "0 0 4px", fontSize: 10, color: "#FCA5A5" }}>Weaknesses</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-body)" }}>
            {feedbackSummary.weaknesses.slice(0, 5).map((line, i) => (
              <li key={`w-${i}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function InterviewTimelineCard({
  row,
  showCandidate,
  canAct,
  onReschedule,
  onCancel,
  onFeedback,
}) {
  const statusMeta = STATUS_META[row.status] ?? STATUS_META.SCHEDULED;
  const active = row.isUpcoming && row.status !== "CANCELLED";
  const ended = hasInterviewEnded(row);
  const canReschedule =
    canAct && (row.status === "SCHEDULED" || row.status === "RESCHEDULED") && row.isUpcoming;
  const canCancel =
    canAct && (row.status === "SCHEDULED" || row.status === "RESCHEDULED") && row.isUpcoming;
  const canFeedback =
    canAct && row.status !== "CANCELLED" && ended && !row.myFeedbackSubmitted;

  return (
    <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
      <TimelineDot color={statusMeta.color} active={active} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-heading-soft)" }}>
            {row.title || "Interview"}
          </span>
          <StatusBadge label={statusMeta.label} color={statusMeta.color} bg={statusMeta.bg} />
          {showCandidate && row.application?.candidate?.candidateName ? (
            <span style={{ ...T.mono, fontSize: 10, color: "var(--text-muted)" }}>
              {row.application.candidate.candidateName}
              {row.application.job?.title ? ` · ${row.application.job.title}` : ""}
            </span>
          ) : null}
        </div>
        <p style={{ ...T.mono, margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
          {formatWhen(row.scheduledAt, row.durationMinutes)}
        </p>
        {row.meetingLink ? (
          <a
            href={row.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...T.mono, fontSize: 11, color: "var(--accent)" }}
          >
            Join meeting
          </a>
        ) : null}
        {row.interviewers?.length > 0 ? (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-body)" }}>
            Panel:{" "}
            {row.interviewers
              .map((i) => `${i.user?.name || i.user?.email || i.userId} (${roleLabel(i.role)})`)
              .join(", ")}
          </p>
        ) : null}
        {row.feedback?.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            <p style={{ ...T.mono, margin: "0 0 4px", fontSize: 10, color: "var(--text-muted)" }}>
              Individual feedback
            </p>
            {row.feedback.map((f) => {
              const rm = RECOMMENDATION_META[f.recommendation];
              return (
                <div
                  key={f.id}
                  style={{
                    fontSize: 12,
                    color: "var(--text-body)",
                    marginBottom: 4,
                    paddingLeft: 8,
                    borderLeft: `2px solid ${rm?.color ?? "#6B7280"}`,
                  }}
                >
                  <strong>{f.reviewer?.name || f.reviewer?.email || "Reviewer"}</strong>
                  {": "}
                  {formatRecommendation(f.recommendation)}
                  {typeof f.rating === "number" ? ` · ${f.rating}/5` : ""}
                </div>
              );
            })}
          </div>
        ) : null}
        <FeedbackSummaryBlock decision={row.decision} />
        {(canReschedule || canCancel || canFeedback || row.myFeedbackSubmitted) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {canReschedule ? (
              <Button size="sm" variant="ghost" onClick={() => onReschedule(row)}>
                Reschedule
              </Button>
            ) : null}
            {canCancel ? (
              <Button size="sm" variant="destructive" onClick={() => onCancel(row)}>
                Cancel
              </Button>
            ) : null}
            {canFeedback ? (
              <Button size="sm" onClick={() => onFeedback(row)}>
                Submit feedback
              </Button>
            ) : null}
            {row.myFeedbackSubmitted ? (
              <span style={{ ...T.mono, fontSize: 11, color: "#34D399", alignSelf: "center" }}>
                Your feedback submitted
              </span>
            ) : null}
            {canAct && !ended && row.status !== "CANCELLED" ? (
              <span style={{ ...T.mono, fontSize: 10, color: "var(--text-muted)", alignSelf: "center" }}>
                Feedback opens after the interview ends
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Interview timeline for an application or job (GET /api/interviews).
 */
interface InterviewTimelineProps {
  applicationId?: string;
  jobId?: string;
  enabled?: boolean;
  refreshKey?: number;
  showCandidate?: boolean;
  compact?: boolean;
}

export default function InterviewTimeline({
  applicationId,
  jobId,
  enabled = true,
  refreshKey = 0,
  showCandidate = false,
  compact = false,
}: InterviewTimelineProps) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canAct = canEditCandidate(role);

  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  const [rescheduleModal, setRescheduleModal] = useState({ open: false, row: null });
  const [cancelModal, setCancelModal] = useState({ open: false, row: null });
  const [feedbackModal, setFeedbackModal] = useState({ open: false, row: null });
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleUsersLoading, setScheduleUsersLoading] = useState(false);
  const [interviewerOptions, setInterviewerOptions] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({
    scheduledAt: "",
    durationMinutes: 60,
    meetingLink: "",
    interviewerUserId: "",
    interviewerRole: "TECHNICAL_INTERVIEWER",
  });

  const [rescheduleForm, setRescheduleForm] = useState({
    scheduledAt: "",
    durationMinutes: 60,
    meetingLink: "",
  });
  const [cancelReason, setCancelReason] = useState("");
  const [feedbackForm, setFeedbackForm] = useState({
    recommendation: "NEUTRAL",
    rating: "3",
    strengths: "",
    weaknesses: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const query = useMemo(() => {
    if (applicationId) return `applicationId=${encodeURIComponent(applicationId)}`;
    if (jobId) return `jobId=${encodeURIComponent(jobId)}`;
    return "";
  }, [applicationId, jobId]);

  const load = useCallback(async () => {
    if (!enabled || !query) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/interviews?${query}`, { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Failed to load interviews (${res.status})`);
      }
      setUpcoming(Array.isArray(body.upcoming) ? body.upcoming : []);
      setPast(Array.isArray(body.past) ? body.past : []);
    } catch (e) {
      setUpcoming([]);
      setPast([]);
      setError(e instanceof Error ? e.message : "Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, [enabled, query]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const openReschedule = (row) => {
    setRescheduleForm({
      scheduledAt: toDatetimeLocalValue(row.scheduledAt),
      durationMinutes: row.durationMinutes ?? 60,
      meetingLink: row.meetingLink ?? "",
    });
    setRescheduleModal({ open: true, row });
    setActionMsg("");
  };

  const openCancel = (row) => {
    setCancelReason("");
    setCancelModal({ open: true, row });
    setActionMsg("");
  };

  const openFeedback = (row) => {
    setFeedbackForm({
      recommendation: "NEUTRAL",
      rating: "3",
      strengths: "",
      weaknesses: "",
      notes: "",
    });
    setFeedbackModal({ open: true, row });
    setActionMsg("");
  };

  const openScheduleModal = useCallback(async () => {
    if (!applicationId) return;
    setActionMsg("");
    setScheduleUsersLoading(true);
    try {
      const res = await fetch("/api/users/visible", { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Could not load users (${res.status})`);
      }
      const fromApi = Array.isArray(body.data) ? body.data : [];
      const viewerId = typeof session?.user?.id === "string" ? session.user.id : "";
      const selfRow =
        viewerId !== ""
          ? {
              id: viewerId,
              name: session?.user?.name ?? "",
              email: session?.user?.email ?? "",
              role: session?.user?.role ?? "",
            }
          : null;
      const byId = new Map();
      if (selfRow) byId.set(selfRow.id, selfRow);
      for (const u of fromApi) {
        if (u && typeof u.id === "string") byId.set(u.id, u);
      }
      const merged = [...byId.values()].sort((a, b) =>
        String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), undefined, {
          sensitivity: "base",
        })
      );
      setInterviewerOptions(merged);
      const defaultLead = new Date(Date.now() + 90 * 60_000);
      const defaultId =
        viewerId && merged.some((u) => u.id === viewerId) ? viewerId : merged[0]?.id ?? "";
      setScheduleForm({
        scheduledAt: toDatetimeLocalValue(defaultLead.toISOString()),
        durationMinutes: 60,
        meetingLink: "",
        interviewerUserId: defaultId,
        interviewerRole: "TECHNICAL_INTERVIEWER",
      });
      setScheduleModal(true);
    } catch (e) {
      setInterviewerOptions([]);
      setActionMsg(e instanceof Error ? e.message : "Could not open schedule form");
    } finally {
      setScheduleUsersLoading(false);
    }
  }, [applicationId, session?.user?.id, session?.user?.name, session?.user?.email, session?.user?.role]);

  const submitSchedule = async () => {
    if (!applicationId) return;
    const scheduledAt = fromDatetimeLocalValue(scheduleForm.scheduledAt);
    if (!scheduledAt) {
      setActionMsg("Enter a valid date and time");
      return;
    }
    const rawDuration = Number(scheduleForm.durationMinutes);
    if (
      !Number.isFinite(rawDuration) ||
      !Number.isInteger(rawDuration) ||
      rawDuration < 5 ||
      rawDuration > 480
    ) {
      setActionMsg("Duration must be a whole number between 5 and 480 minutes");
      return;
    }
    const durationMinutes = rawDuration;
    const interviewerUserId = scheduleForm.interviewerUserId.trim();
    if (!interviewerUserId) {
      setActionMsg("Select at least one interviewer");
      return;
    }
    setBusy(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          scheduledAt,
          durationMinutes,
          meetingLink: scheduleForm.meetingLink.trim() || undefined,
          interviewers: [{ userId: interviewerUserId, role: scheduleForm.interviewerRole }],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Schedule failed (${res.status})`);
      }
      setScheduleModal(false);
      setActionMsg("Interview scheduled");
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Schedule failed");
    } finally {
      setBusy(false);
    }
  };

  const submitReschedule = async () => {
    const row = rescheduleModal.row;
    if (!row?.id) return;
    const scheduledAt = fromDatetimeLocalValue(rescheduleForm.scheduledAt);
    if (!scheduledAt) {
      setActionMsg("Enter a valid date and time");
      return;
    }
    setBusy(true);
    setActionMsg("");
    try {
      const res = await fetch(`/api/interviews/${encodeURIComponent(row.id)}/reschedule`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt,
          durationMinutes: Number(rescheduleForm.durationMinutes),
          meetingLink: rescheduleForm.meetingLink.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Reschedule failed (${res.status})`);
      }
      setRescheduleModal({ open: false, row: null });
      setActionMsg("Interview rescheduled");
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Reschedule failed");
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = async () => {
    const row = cancelModal.row;
    if (!row?.id) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setActionMsg("Cancellation reason is required");
      return;
    }
    setBusy(true);
    setActionMsg("");
    try {
      const res = await fetch(`/api/interviews/${encodeURIComponent(row.id)}/cancel`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Cancel failed (${res.status})`);
      }
      setCancelModal({ open: false, row: null });
      setActionMsg("Interview cancelled");
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const submitFeedback = async () => {
    const row = feedbackModal.row;
    if (!row?.id) return;
    setBusy(true);
    setActionMsg("");
    try {
      const rating = Number(feedbackForm.rating);
      const res = await fetch(`/api/interviews/${encodeURIComponent(row.id)}/feedback`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendation: feedbackForm.recommendation,
          rating: Number.isInteger(rating) ? rating : undefined,
          strengths: feedbackForm.strengths.trim() || undefined,
          weaknesses: feedbackForm.weaknesses.trim() || undefined,
          notes: feedbackForm.notes.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Feedback failed (${res.status})`);
      }
      setFeedbackModal({ open: false, row: null });
      setActionMsg("Feedback submitted");
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Feedback failed");
    } finally {
      setBusy(false);
    }
  };

  if (!applicationId && !jobId) return null;

  const total = upcoming.length + past.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: compact ? 8 : 14 }}>
        <div>
          <p style={{ ...T.mono, margin: 0, fontSize: 10, color: "#3B82F6", textTransform: "uppercase", letterSpacing: ".08em" }}>
            Interview timeline
          </p>
          {!compact ? (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)", maxWidth: 560 }}>
              Chronological view of upcoming and completed interviews with panel status and aggregated feedback.
              {applicationId ? (
                <>
                  {" "}
                  Kanban stage &ldquo;INTERVIEW&rdquo; is only the pipeline label — use{" "}
                  <strong>Schedule interview</strong> to record a real date and panel here.
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {applicationId && canAct ? (
            <Button size="sm" disabled={loading || busy || scheduleUsersLoading} onClick={() => void openScheduleModal()}>
              {scheduleUsersLoading ? "Opening…" : "Schedule interview"}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? <p style={{ color: "#FCA5A5", fontSize: 13 }}>{error}</p> : null}
      {actionMsg ? (
        <p style={{ ...T.mono, fontSize: 11, color: "#34D399", marginBottom: 8 }}>{actionMsg}</p>
      ) : null}

      {loading && total === 0 ? (
        <p style={{ ...T.mono, fontSize: 12, color: "var(--text-muted)" }}>Loading interviews…</p>
      ) : null}

      {!loading && total === 0 && !error ? (
        <p style={{ ...T.mono, fontSize: 12, color: "var(--text-muted)", maxWidth: 560 }}>
          No interviews scheduled yet.
          {applicationId && canAct ? (
            <>
              {" "}
              Click <strong>Schedule interview</strong> above to add a time, meeting link, and interviewer — then it
              appears under Upcoming.
            </>
          ) : applicationId ? (
            <> Ask an admin, hiring manager, or recruiter to schedule.</>
          ) : (
            <> Open an applicant row and use Interviews there to schedule for that application.</>
          )}
        </p>
      ) : null}

      {upcoming.length > 0 ? (
        <section style={{ marginBottom: 20 }}>
          <h3 style={{ ...T.mono, margin: "0 0 12px", fontSize: 11, color: "#60A5FA", textTransform: "uppercase" }}>
            Upcoming ({upcoming.length})
          </h3>
          <div style={{ display: "grid", gap: 16, paddingLeft: 4, borderLeft: "2px solid rgba(96,165,250,.25)" }}>
            {[...upcoming]
              .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
              .map((row) => (
                <InterviewTimelineCard
                  key={row.id}
                  row={row}
                  showCandidate={showCandidate}
                  canAct={canAct}
                  onReschedule={openReschedule}
                  onCancel={openCancel}
                  onFeedback={openFeedback}
                />
              ))}
          </div>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section>
          <h3 style={{ ...T.mono, margin: "0 0 12px", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Past ({past.length})
          </h3>
          <div style={{ display: "grid", gap: 16, paddingLeft: 4, borderLeft: "2px solid var(--app-border-strong)" }}>
            {past.map((row) => (
              <InterviewTimelineCard
                key={row.id}
                row={row}
                showCandidate={showCandidate}
                canAct={canAct}
                onReschedule={openReschedule}
                onCancel={openCancel}
                onFeedback={openFeedback}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Dialog
        open={rescheduleModal.open}
        onOpenChange={(open) => !open && setRescheduleModal({ open: false, row: null })}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reschedule interview</DialogTitle>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>New date & time</FieldLabel>
              <Input
                type="datetime-local"
                value={rescheduleForm.scheduledAt}
                onChange={(e) => setRescheduleForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Duration (minutes)</FieldLabel>
              <Input
                type="number"
                min={5}
                max={480}
                value={rescheduleForm.durationMinutes}
                onChange={(e) =>
                  setRescheduleForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>Meeting link (optional)</FieldLabel>
              <Input
                value={rescheduleForm.meetingLink}
                onChange={(e) => setRescheduleForm((f) => ({ ...f, meetingLink: e.target.value }))}
                placeholder="https://…"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRescheduleModal({ open: false, row: null })}>
              Close
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void submitReschedule()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelModal.open}
        onOpenChange={(open) => !open && setCancelModal({ open: false, row: null })}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel interview</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel>Reason (required)</FieldLabel>
            <Textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Explain why this interview is cancelled…"
            />
          </Field>
          <DialogFooter>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCancelModal({ open: false, row: null })}>
              Close
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void submitCancel()}>
              {busy ? "Cancelling…" : "Cancel interview"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={scheduleModal}
        onOpenChange={(open) => {
          if (!open && !busy) setScheduleModal(false);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule interview</DialogTitle>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <p className="text-sm text-muted-foreground">
              Creates a calendar interview for this application (separate from Kanban stage). At least 15 minutes lead
              time is required unless your env overrides it.
            </p>
            {scheduleUsersLoading ? (
              <p className="text-xs text-muted-foreground" style={T.mono}>Loading interviewers…</p>
            ) : null}
            <Field>
              <FieldLabel>Date & time</FieldLabel>
              <Input
                type="datetime-local"
                value={scheduleForm.scheduledAt}
                onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Duration (minutes)</FieldLabel>
              <Input
                type="number"
                min={5}
                max={480}
                value={scheduleForm.durationMinutes}
                onChange={(e) => setScheduleForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
              />
            </Field>
            <Field>
              <FieldLabel>Meeting link (optional)</FieldLabel>
              <Input
                value={scheduleForm.meetingLink}
                onChange={(e) => setScheduleForm((f) => ({ ...f, meetingLink: e.target.value }))}
                placeholder="https://…"
              />
            </Field>
            <Field>
              <FieldLabel>Interviewer</FieldLabel>
              <OptionSelect
                value={scheduleForm.interviewerUserId}
                onChange={(v) => setScheduleForm((f) => ({ ...f, interviewerUserId: v }))}
                placeholder={interviewerOptions.length ? "Select…" : "No users available"}
                options={[
                  { value: "", label: interviewerOptions.length ? "Select…" : "No users available" },
                  ...interviewerOptions.map((u) => ({
                    value: u.id,
                    label: `${u.name || u.email || u.id}${u.role ? ` (${u.role})` : ""}`,
                  })),
                ]}
              />
            </Field>
            <Field>
              <FieldLabel>Interviewer role</FieldLabel>
              <OptionSelect
                value={scheduleForm.interviewerRole}
                onChange={(v) => setScheduleForm((f) => ({ ...f, interviewerRole: v }))}
                options={INTERVIEWER_ROLE_OPTIONS}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setScheduleModal(false)}>
              Close
            </Button>
            <Button size="sm" disabled={busy || scheduleUsersLoading || !scheduleForm.interviewerUserId} onClick={() => void submitSchedule()}>
              {busy ? "Scheduling…" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={feedbackModal.open}
        onOpenChange={(open) => !open && setFeedbackModal({ open: false, row: null })}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Submit interview feedback</DialogTitle>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>Recommendation</FieldLabel>
              <OptionSelect
                value={feedbackForm.recommendation}
                onChange={(v) => setFeedbackForm((f) => ({ ...f, recommendation: v }))}
                options={RECOMMENDATION_OPTIONS}
              />
            </Field>
            <Field>
              <FieldLabel>Rating (1–5)</FieldLabel>
              <OptionSelect
                value={feedbackForm.rating}
                onChange={(v) => setFeedbackForm((f) => ({ ...f, rating: v }))}
                options={["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n }))}
              />
            </Field>
            <Field>
              <FieldLabel>Strengths</FieldLabel>
              <Textarea
                rows={2}
                value={feedbackForm.strengths}
                onChange={(e) => setFeedbackForm((f) => ({ ...f, strengths: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Weaknesses</FieldLabel>
              <Textarea
                rows={2}
                value={feedbackForm.weaknesses}
                onChange={(e) => setFeedbackForm((f) => ({ ...f, weaknesses: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Textarea
                rows={2}
                value={feedbackForm.notes}
                onChange={(e) => setFeedbackForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setFeedbackModal({ open: false, row: null })}>
              Close
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void submitFeedback()}>
              {busy ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
