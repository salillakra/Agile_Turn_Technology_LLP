import { renderBaseEmail } from "@/src/lib/email/templates/base-template";
import { getEmailBrand } from "@/src/lib/email/templates/brand";
import {
  emailButton,
  emailDetailTable,
  emailParagraph,
  plainTextBlock,
} from "@/src/lib/email/templates/components";
import { stringField } from "@/src/lib/email/templates/layout";
import {
  formatInterviewWhen,
  renderInterviewScheduledEmail,
} from "@/src/lib/email/templates/interview-scheduled";
import {
  parseInterviewSchedule,
  resolveInterviewer,
  resolveMeetingLink,
} from "@/src/lib/email/templates/interview-schedule-fields";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
import type { RenderedEmail } from "@/src/lib/email/templates/types";

export { formatInterviewWhen, renderInterviewScheduledEmail };

function resolveReminderLeadHours(data: Record<string, unknown>): 24 | 1 {
  const raw = data.reminderLeadHours;
  if (raw === 1 || raw === "1") return 1;
  return 24;
}

function reminderLeadCopy(leadHours: 24 | 1): string {
  return leadHours === 1
    ? "Your interview is in about 1 hour."
    : "Your interview is in about 24 hours.";
}

/**
 * Delayed interview reminder (`interview_reminder`) — 24h or 1h before `interviewDate`.
 */
export function renderInterviewReminderEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const candidateName = stringField(data, "candidateName") || "there";
  const jobTitle = stringField(data, "jobTitle") || "the role";
  const schedule = parseInterviewSchedule(data);
  const leadHours = resolveReminderLeadHours(data);
  const interviewer =
    resolveInterviewer(data) || "Your recruiting team";
  const meetingLink = resolveMeetingLink(data);
  const timeDisplay =
    schedule.timeZoneLabel && schedule.time !== "To be confirmed"
      ? `${schedule.time} (${schedule.timeZoneLabel})`
      : schedule.time;

  const bodyHtml =
    emailParagraph(`Hello ${candidateName},`) +
    emailParagraph(reminderLeadCopy(leadHours)) +
    emailParagraph(`This is a reminder for your interview for ${jobTitle}.`) +
    emailDetailTable([
      { label: "Role", value: jobTitle },
      { label: "Date", value: schedule.date },
      { label: "Time", value: timeDisplay },
      { label: "Interviewer", value: interviewer },
      ...(meetingLink ? [{ label: "Meeting link", value: meetingLink }] : []),
    ]) +
    (meetingLink
      ? emailButton({ href: meetingLink, label: "Join meeting", brand })
      : "") +
    emailParagraph("Please join a few minutes early if this is a virtual interview.");

  const html = renderBaseEmail({
    title: leadHours === 1 ? "Interview in 1 hour" : "Interview in 24 hours",
    headerSubtitle: brand.productName,
    preheader: `${jobTitle} — ${schedule.date} ${schedule.time}`,
    bodyHtml,
  });

  const textBody = plainTextBlock([
    `Hello ${candidateName},`,
    reminderLeadCopy(leadHours),
    `Interview for ${jobTitle}.`,
    `Date: ${schedule.date}`,
    `Time: ${timeDisplay}`,
    `Interviewer: ${interviewer}`,
    meetingLink ? `Meeting link: ${meetingLink}` : "",
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}

export function renderInterviewNotificationEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const candidateName = stringField(data, "candidateName") || "A candidate";
  const jobTitle = stringField(data, "jobTitle") || "a role";
  const applicationId = stringField(data, "applicationId");
  const appUrl = applicationId
    ? `${brand.appUrl}/applications/${applicationId}`
    : brand.appUrl;

  const bodyHtml =
    emailParagraph(`${candidateName} is in the Interview stage for ${jobTitle}.`) +
    emailParagraph("Please review the application in the recruitment suite.") +
    emailButton({ href: appUrl, label: "Open application", brand });

  const html = renderBaseEmail({
    title: "Interview stage",
    headerSubtitle: brand.productName,
    preheader: `${candidateName} — interview`,
    bodyHtml,
  });

  const textBody = plainTextBlock([
    `${candidateName} is in the Interview stage for ${jobTitle}.`,
    "Please review the application in the recruitment suite.",
    `Open: ${appUrl}`,
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
