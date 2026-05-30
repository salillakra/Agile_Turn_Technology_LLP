/** Human-readable labels for `ApplicationStage` enum values (email + notifications). */
export function formatApplicationStageLabel(stage: string): string {
  const map: Record<string, string> = {
    APPLIED: "Applied",
    SCREENING: "Screening",
    INTERVIEW: "Interview",
    TECHNICAL: "Technical",
    FINAL_ROUND: "Final round",
    OFFER_SENT: "Offer sent",
    HIRED: "Hired",
    REJECTED: "Rejected",
  };
  const label = map[stage];
  if (label) return label;
  return stage
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/** Subject line for candidate stage-update emails. */
export function buildCandidateStageUpdateSubject(jobTitle: string): string {
  const title = jobTitle.trim() || "your application";
  return `Application Update — ${title}`;
}

/** Subject line for interview scheduled emails. */
export function buildInterviewScheduledSubject(jobTitle: string): string {
  const title = jobTitle.trim() || "your role";
  return `Interview Scheduled — ${title}`;
}

/** Subject line for interview cancelled emails. */
export function buildInterviewCancelledSubject(jobTitle: string): string {
  const title = jobTitle.trim() || "your role";
  return `Interview Cancelled — ${title}`;
}

/** Subject line for interview rescheduled emails (candidate). */
export function buildInterviewRescheduledSubject(jobTitle: string): string {
  const title = jobTitle.trim() || "your role";
  return `Interview Rescheduled — ${title}`;
}

/** Subject line for interviewer panel notices. */
export function buildInterviewPanelNoticeSubject(
  jobTitle: string,
  kind: "scheduled" | "rescheduled" | "cancelled"
): string {
  const title = jobTitle.trim() || "Interview";
  switch (kind) {
    case "scheduled":
      return `Interview assignment — ${title}`;
    case "rescheduled":
      return `Interview rescheduled — ${title}`;
    case "cancelled":
      return `Interview cancelled — ${title}`;
  }
}

/** Subject line for candidate offer letter emails. */
export function buildOfferLetterSubject(jobTitle: string): string {
  const title = jobTitle.trim() || "your role";
  return `Offer Letter — ${title}`;
}

/** Subject line for delayed interview reminder emails. */
export function buildInterviewReminderSubject(
  jobTitle: string,
  leadHours: 24 | 1
): string {
  const title = jobTitle.trim() || "your interview";
  if (leadHours === 1) {
    return `Interview in 1 hour — ${title}`;
  }
  return `Interview in 24 hours — ${title}`;
}

/** Subject line for interviewer delayed interview reminder emails. */
export function buildInterviewReminderInterviewerSubject(
  jobTitle: string,
  leadHours: 24 | 1
): string {
  const title = jobTitle.trim() || "the role";
  if (leadHours === 1) {
    return `Panel interview in 1 hour — ${title}`;
  }
  return `Panel interview in 24 hours — ${title}`;
}
