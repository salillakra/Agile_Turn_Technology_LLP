import { renderBaseEmail } from "@/src/lib/email/templates/base-template";
import { getEmailBrand } from "@/src/lib/email/templates/brand";
import {
  emailDetailTable,
  emailParagraph,
  plainTextBlock,
} from "@/src/lib/email/templates/components";
import {
  parseInterviewSchedule,
  resolveInterviewer,
} from "@/src/lib/email/templates/interview-schedule-fields";
import { stringField } from "@/src/lib/email/templates/layout";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
import type { RenderedEmail } from "@/src/lib/email/templates/types";

/**
 * Interview cancelled — candidate notification (`interview_cancelled`).
 *
 * Expected `data`: jobTitle, interviewDate (ISO), candidateName, cancellationReason (optional).
 */
export function renderInterviewCancelledEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const candidateName = stringField(data, "candidateName") || "there";
  const jobTitle = stringField(data, "jobTitle") || "the role";
  const schedule = parseInterviewSchedule(data);
  const interviewer = resolveInterviewer(data) || "Your recruiting team";
  const reason = stringField(data, "cancellationReason");

  const timeDisplay =
    schedule.timeZoneLabel && schedule.time !== "To be confirmed"
      ? `${schedule.time} (${schedule.timeZoneLabel})`
      : schedule.time;

  const bodyHtml =
    emailParagraph(`Hello ${candidateName},`) +
    emailParagraph(`Your interview for ${jobTitle} has been cancelled.`) +
    emailDetailTable([
      { label: "Role", value: jobTitle },
      { label: "Originally scheduled", value: `${schedule.date} ${timeDisplay}` },
      { label: "Interviewer", value: interviewer },
      ...(reason ? [{ label: "Reason", value: reason }] : []),
    ]) +
    emailParagraph(
      "Your recruiting team will follow up if a new time needs to be arranged."
    );

  const html = renderBaseEmail({
    title: "Interview cancelled",
    headerSubtitle: getEmailBrand().productName,
    preheader: `${jobTitle} — interview cancelled`,
    bodyHtml,
    footerNote: "This message was sent by your recruiting team.",
  });

  const textBody = plainTextBlock([
    `Hello ${candidateName},`,
    `Your interview for ${jobTitle} has been cancelled.`,
    `Originally scheduled: ${schedule.date} ${timeDisplay}`,
    `Interviewer: ${interviewer}`,
    reason ? `Reason: ${reason}` : "",
    "Your recruiting team will follow up if a new time needs to be arranged.",
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
