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
  resolveInterviewer,
  resolveMeetingLink,
} from "@/src/lib/email/templates/interview-schedule-fields";
import { stringField } from "@/src/lib/email/templates/layout";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
import type { RenderedEmail } from "@/src/lib/email/templates/types";

/** @deprecated Use {@link parseInterviewSchedule} */
export function formatInterviewWhen(data: Record<string, unknown>): string {
  const { date, time, timeZoneLabel } = parseInterviewSchedule(data);
  if (date === "To be confirmed") return date;
  return `${date} at ${time} (${timeZoneLabel})`;
}

/**
 * Interview scheduled — candidate notification (`interview_scheduled`).
 *
 * Expected `data`: jobTitle, interviewDate (ISO) or date+time, interviewer, meetingLink,
 * candidateName (optional greeting).
 */
export function renderInterviewScheduledEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const candidateName = stringField(data, "candidateName") || "there";
  const jobTitle = stringField(data, "jobTitle") || "the role";
  const schedule = parseInterviewSchedule(data);
  const interviewer =
    resolveInterviewer(data) || "Your recruiting team";
  const meetingLink = resolveMeetingLink(data);

  const timeDisplay =
    schedule.timeZoneLabel && schedule.time !== "To be confirmed"
      ? `${schedule.time} (${schedule.timeZoneLabel})`
      : schedule.time;

  const bodyHtml =
    emailParagraph(`Hello ${candidateName},`) +
    emailParagraph(`Your interview for ${jobTitle} has been scheduled.`) +
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
    emailParagraph(
      "Please join a few minutes early and test your audio/video if this is a virtual interview."
    ) +
    emailParagraph("If you need to reschedule, reply to your recruiting contact.");

  const html = renderBaseEmail({
    title: "Interview scheduled",
    headerSubtitle: brand.productName,
    preheader: `${jobTitle} — ${schedule.date} ${schedule.time}`,
    bodyHtml,
    footerNote: "This message was sent by your recruiting team.",
  });

  const textBody = plainTextBlock([
    `Hello ${candidateName},`,
    `Your interview for ${jobTitle} has been scheduled.`,
    `Date: ${schedule.date}`,
    `Time: ${timeDisplay}`,
    `Interviewer: ${interviewer}`,
    meetingLink ? `Meeting link: ${meetingLink}` : "",
    "If you need to reschedule, reply to your recruiting contact.",
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
