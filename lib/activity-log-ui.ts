import { getPastel } from "@/lib/theme";
import type { ActivityLogItem } from "@/lib/api/activity-logs";

const ACTION_LABELS: Record<string, string> = {
  STAGE_CHANGED: "Stage changed",
  APPLICATION_CREATED: "Application created",
  APPLICATION_DELETED: "Application deleted",
  NOTES_UPDATED: "Notes updated",
  FEEDBACK_SUBMITTED: "Feedback submitted",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_RESCHEDULED: "Interview rescheduled",
  INTERVIEW_CANCELLED: "Interview cancelled",
  EMAIL_SENT: "Email sent",
  EMAIL_FAILED: "Email failed",
  INTERVIEW_REMINDER_SENT: "Interview reminder sent",
  NOTIFICATION_SENT: "Notification sent",
  RECOMMENDATION_GENERATED: "Recommendations generated",
  RECOMMENDATION_ACCEPTED: "Recommendation accepted",
  CANDIDATE_RECOMMENDED: "Candidate recommended",
  CANDIDATE_SHORTLISTED: "Candidate shortlisted",
  CANDIDATE_SCORED: "Candidate scored",
  HIGH_MATCH_FOUND: "High match found",
  AI_SEARCH_PERFORMED: "AI search performed",
  CANDIDATE_AI_MATCHED: "Candidate AI matched",
  RECRUITER_AI_SEARCH_EXECUTED: "AI search executed",
  RECRUITER_AI_SEARCH_RESULT_CLICKED: "AI search result opened",
  RECRUITER_AI_SEARCH_SHORTLISTED: "AI search shortlist",
  RESUME_PARSE_FAILED: "Resume parse failed",
  RESUME_PARSE_APPLIED: "Resume applied to candidate",
};

type PastelKey = "red" | "blue" | "green" | "yellow";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatActivityAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatActivitySummary(log: ActivityLogItem): string {
  const details = log.details;

  if (!isRecord(details)) {
    return log.applicationId ? `Application ${shortId(log.applicationId)}` : "—";
  }

  if (typeof details.from === "string" && typeof details.to === "string") {
    return `${details.from.replace(/_/g, " ")} → ${details.to.replace(/_/g, " ")}`;
  }

  if (typeof details.recipient === "string") {
    const emailType = typeof details.emailType === "string" ? details.emailType : null;
    return emailType ? `${details.recipient} (${emailType})` : details.recipient;
  }

  if (typeof details.query === "string" && details.query.trim()) {
    return details.query.trim();
  }

  if (typeof details.candidateName === "string" && details.candidateName.trim()) {
    return details.candidateName.trim();
  }

  if (typeof details.jobTitle === "string" && details.jobTitle.trim()) {
    return details.jobTitle.trim();
  }

  if (typeof details.error === "string" && details.error.trim()) {
    return details.error.trim();
  }

  if (typeof details.summary === "string" && details.summary.trim()) {
    return details.summary.trim();
  }

  if (log.applicationId) {
    return `Application ${shortId(log.applicationId)}`;
  }

  return "—";
}

export function getActivityActorName(log: ActivityLogItem): string {
  return log.user?.name?.trim() || log.user?.email?.trim() || "System";
}

export function getActivityPastelKey(action: string): PastelKey {
  if (action.includes("FAILED") || action.includes("DELETED")) return "red";
  if (action.startsWith("EMAIL") || action.includes("NOTIFICATION")) return "yellow";
  if (action.startsWith("INTERVIEW") || action.includes("FEEDBACK")) return "green";
  if (action.includes("AI") || action.includes("SEARCH") || action.includes("RECOMMEND")) return "blue";
  return "blue";
}

export function getActivityBadgeStyle(action: string): { color: string; background: string } {
  const key = getActivityPastelKey(action);
  const pastel = getPastel(key);
  return { color: pastel.text, background: pastel.bg };
}

export function formatActivityTimestamp(iso: string): { absolute: string; relative: string } {
  const date = new Date(iso);
  const absolute = Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  const relative = Number.isNaN(date.getTime()) ? "—" : formatRelativeTime(date);
  return { absolute, relative };
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
