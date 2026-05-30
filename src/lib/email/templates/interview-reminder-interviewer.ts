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

function resolveReminderLeadHours(data: Record<string, unknown>): 24 | 1 {
  const raw = data.reminderLeadHours;
  if (raw === 1 || raw === "1") return 1;
  return 24;
}

function reminderLeadCopy(leadHours: 24 | 1): string {
  return leadHours === 1
    ? "You have a panel interview in about 1 hour."
    : "You have a panel interview in about 24 hours.";
}

/**
 * Delayed interview reminder for assigned interviewers (`interview_reminder_interviewer`).
 */
export function renderInterviewReminderInterviewerEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const interviewerName = stringField(data, "interviewerName") || "there";
  const candidateName = stringField(data, "candidateName") || "the candidate";
  const jobTitle = stringField(data, "jobTitle") || "the role";
  const schedule = parseInterviewSchedule(data);
  const leadHours = resolveReminderLeadHours(data);
  const meetingLink = resolveMeetingLink(data);
  const applicationId = stringField(data, "applicationId");
  const appUrl = applicationId
    ? `${brand.appUrl}/applications/${applicationId}`
    : brand.appUrl;

  const timeDisplay =
    schedule.timeZoneLabel && schedule.time !== "To be confirmed"
      ? `${schedule.time} (${schedule.timeZoneLabel})`
      : schedule.time;

  const bodyHtml =
    emailParagraph(`Hello ${interviewerName},`) +
    emailParagraph(reminderLeadCopy(leadHours)) +
    emailParagraph(`You are scheduled to interview ${candidateName} for ${jobTitle}.`) +
    emailDetailTable([
      { label: "Role", value: jobTitle },
      { label: "Candidate", value: candidateName },
      { label: "Date", value: schedule.date },
      { label: "Time", value: timeDisplay },
      ...(meetingLink ? [{ label: "Meeting link", value: meetingLink }] : []),
    ]) +
    (meetingLink
      ? emailButton({ href: meetingLink, label: "Join meeting", brand })
      : "") +
    emailButton({ href: appUrl, label: "Open application", brand });

  const html = renderBaseEmail({
    title: leadHours === 1 ? "Interview in 1 hour" : "Interview in 24 hours",
    headerSubtitle: brand.productName,
    preheader: `${candidateName} — ${jobTitle}`,
    bodyHtml,
  });

  const textBody = plainTextBlock([
    `Hello ${interviewerName},`,
    reminderLeadCopy(leadHours),
    `Interview ${candidateName} for ${jobTitle}.`,
    `Date: ${schedule.date}`,
    `Time: ${timeDisplay}`,
    meetingLink ? `Meeting link: ${meetingLink}` : "",
    `Open application: ${appUrl}`,
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
