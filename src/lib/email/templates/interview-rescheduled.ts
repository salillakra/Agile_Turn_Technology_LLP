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

/**
 * Interview rescheduled — candidate notification (`interview_rescheduled`).
 */
export function renderInterviewRescheduledEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const candidateName = stringField(data, "candidateName") || "there";
  const jobTitle = stringField(data, "jobTitle") || "the role";
  const schedule = parseInterviewSchedule(data);
  const previousSchedule = parseInterviewSchedule({
    interviewDate: data.previousInterviewDate,
    timeZone: data.timeZone,
  });
  const interviewer = resolveInterviewer(data) || "Your recruiting team";
  const meetingLink = resolveMeetingLink(data);

  const timeDisplay =
    schedule.timeZoneLabel && schedule.time !== "To be confirmed"
      ? `${schedule.time} (${schedule.timeZoneLabel})`
      : schedule.time;
  const previousTimeDisplay =
    previousSchedule.timeZoneLabel && previousSchedule.time !== "To be confirmed"
      ? `${previousSchedule.time} (${previousSchedule.timeZoneLabel})`
      : previousSchedule.time;

  const bodyHtml =
    emailParagraph(`Hello ${candidateName},`) +
    emailParagraph(`Your interview for ${jobTitle} has been rescheduled.`) +
    emailDetailTable([
      { label: "Role", value: jobTitle },
      { label: "Previous time", value: `${previousSchedule.date} ${previousTimeDisplay}` },
      { label: "New date", value: schedule.date },
      { label: "New time", value: timeDisplay },
      { label: "Interviewer", value: interviewer },
      ...(meetingLink ? [{ label: "Meeting link", value: meetingLink }] : []),
    ]) +
    (meetingLink
      ? emailButton({ href: meetingLink, label: "Join meeting", brand: getEmailBrand() })
      : "") +
    emailParagraph("If the new time does not work, reply to your recruiting contact.");

  const html = renderBaseEmail({
    title: "Interview rescheduled",
    headerSubtitle: getEmailBrand().productName,
    preheader: `${jobTitle} — new time ${schedule.date}`,
    bodyHtml,
  });

  const textBody = plainTextBlock([
    `Hello ${candidateName},`,
    `Your interview for ${jobTitle} has been rescheduled.`,
    `Previous: ${previousSchedule.date} ${previousTimeDisplay}`,
    `New: ${schedule.date} ${timeDisplay}`,
    `Interviewer: ${interviewer}`,
    meetingLink ? `Meeting link: ${meetingLink}` : "",
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
