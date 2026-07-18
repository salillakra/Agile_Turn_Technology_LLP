import { renderBaseEmail } from "@/src/lib/email/templates/base-template";
import { getEmailBrand } from "@/src/lib/email/templates/brand";
import {
  emailButton,
  emailDetailTable,
  emailParagraph,
  plainTextBlock,
} from "@/src/lib/email/templates/components";
import {
  parseInterviewSchedule,
  resolveMeetingLink,
} from "@/src/lib/email/templates/interview-schedule-fields";
import { stringField } from "@/src/lib/email/templates/layout";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
import type { RenderedEmail } from "@/src/lib/email/templates/types";
import { applicationApplicantsUrl } from "@/src/lib/application-deep-link";

type PanelNoticeKind = "scheduled" | "rescheduled" | "cancelled";

function panelCopy(kind: PanelNoticeKind): { title: string; lead: string } {
  switch (kind) {
    case "scheduled":
      return {
        title: "Interview scheduled",
        lead: "You have been assigned to interview the following candidate.",
      };
    case "rescheduled":
      return {
        title: "Interview rescheduled",
        lead: "An interview you are assigned to has been rescheduled.",
      };
    case "cancelled":
      return {
        title: "Interview cancelled",
        lead: "An interview you were assigned to has been cancelled.",
      };
  }
}

function resolvePanelKind(data: Record<string, unknown>): PanelNoticeKind {
  const raw = stringField(data, "panelNoticeKind");
  if (raw === "rescheduled" || raw === "cancelled") return raw;
  return "scheduled";
}

/** Interviewer panel notice (`interview_panel_notice`). */
export function renderInterviewPanelNoticeEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const kind = resolvePanelKind(data);
  const copy = panelCopy(kind);
  const interviewerName = stringField(data, "interviewerName") || "there";
  const candidateName = stringField(data, "candidateName") || "the candidate";
  const jobTitle = stringField(data, "jobTitle") || "the role";
  const schedule = parseInterviewSchedule(data);
  const meetingLink = resolveMeetingLink(data);
  const applicationId = stringField(data, "applicationId");
  const appUrl = applicationId
    ? applicationApplicantsUrl(brand.appUrl, applicationId)
    : brand.appUrl;

  const timeDisplay =
    schedule.timeZoneLabel && schedule.time !== "To be confirmed"
      ? `${schedule.time} (${schedule.timeZoneLabel})`
      : schedule.time;

  const rows: { label: string; value: string }[] = [
    { label: "Role", value: jobTitle },
    { label: "Candidate", value: candidateName },
    { label: "Date", value: schedule.date },
    { label: "Time", value: timeDisplay },
  ];

  if (kind === "rescheduled") {
    const previousSchedule = parseInterviewSchedule({
      interviewDate: data.previousInterviewDate,
      timeZone: data.timeZone,
    });
    const previousTimeDisplay =
      previousSchedule.timeZoneLabel && previousSchedule.time !== "To be confirmed"
        ? `${previousSchedule.time} (${previousSchedule.timeZoneLabel})`
        : previousSchedule.time;
    rows.splice(2, 0, {
      label: "Previous time",
      value: `${previousSchedule.date} ${previousTimeDisplay}`,
    });
  }

  if (kind === "cancelled") {
    const reason = stringField(data, "cancellationReason");
    if (reason) rows.push({ label: "Reason", value: reason });
  } else if (meetingLink) {
    rows.push({ label: "Meeting link", value: meetingLink });
  }

  const bodyHtml =
    emailParagraph(`Hello ${interviewerName},`) +
    emailParagraph(copy.lead) +
    emailDetailTable(rows) +
    (kind !== "cancelled" && meetingLink
      ? emailButton({ href: meetingLink, label: "Join meeting", brand })
      : "") +
    emailButton({ href: appUrl, label: "Open application", brand });

  const html = renderBaseEmail({
    title: copy.title,
    headerSubtitle: brand.productName,
    preheader: `${candidateName} — ${jobTitle}`,
    bodyHtml,
  });

  const textBody = plainTextBlock([
    `Hello ${interviewerName},`,
    copy.lead,
    `Role: ${jobTitle}`,
    `Candidate: ${candidateName}`,
    `When: ${schedule.date} ${timeDisplay}`,
    meetingLink && kind !== "cancelled" ? `Meeting link: ${meetingLink}` : "",
    `Open application: ${appUrl}`,
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
