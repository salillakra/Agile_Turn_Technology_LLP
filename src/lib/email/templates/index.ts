import type { EmailTemplateKey } from "@/src/lib/queues/email-queue";
import { renderApplicationReceivedEmail } from "@/src/lib/email/templates/application-received";
import { renderBaseEmail } from "@/src/lib/email/templates/base-template";
import { renderInterviewCancelledEmail } from "@/src/lib/email/templates/interview-cancelled";
import { renderInterviewRescheduledEmail } from "@/src/lib/email/templates/interview-rescheduled";
import { renderInterviewPanelNoticeEmail } from "@/src/lib/email/templates/interview-panel-notice";
import { renderInterviewReminderInterviewerEmail } from "@/src/lib/email/templates/interview-reminder-interviewer";
import {
  renderInterviewNotificationEmail,
  renderInterviewReminderEmail,
  renderInterviewScheduledEmail,
} from "@/src/lib/email/templates/interview";
import { renderOfferSentEmail } from "@/src/lib/email/templates/offer-sent";
import { renderPasswordResetEmail } from "@/src/lib/email/templates/password-reset";
import { renderCandidateStageUpdateEmail } from "@/src/lib/email/templates/candidate-stage-update";
import { renderStageChangedEmail } from "@/src/lib/email/templates/stage-changed";
import type { EmailTemplateRenderer, RenderedEmail } from "@/src/lib/email/templates/types";
import { emailParagraph } from "@/src/lib/email/templates/components";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";

const RENDERERS: Record<string, EmailTemplateRenderer> = {
  stage_changed: renderStageChangedEmail,
  stage_update: renderCandidateStageUpdateEmail,
  candidate_stage_update: renderCandidateStageUpdateEmail,
  offer_sent: renderOfferSentEmail,
  interview_scheduled: renderInterviewScheduledEmail,
  interview_rescheduled: renderInterviewRescheduledEmail,
  interview_cancelled: renderInterviewCancelledEmail,
  interview_panel_notice: renderInterviewPanelNoticeEmail,
  interview_reminder: renderInterviewReminderEmail,
  interview_reminder_interviewer: renderInterviewReminderInterviewerEmail,
  interview_notification: renderInterviewNotificationEmail,
  application_received: renderApplicationReceivedEmail,
  password_reset: renderPasswordResetEmail,
};

function renderFallback(
  template: string,
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const bodyHtml =
    emailParagraph(`Template: ${template}`) +
    emailParagraph("This is an automated message from the recruitment suite.");

  const html = renderBaseEmail({
    title: subject,
    preheader: subject,
    bodyHtml,
  });

  return buildRenderedEmail({
    subject,
    html,
    textBody: `${subject}\n\nTemplate: ${template}\n\n${JSON.stringify(data, null, 2)}`,
  });
}

/**
 * Resolve HTML + plain-text bodies for a transactional template key.
 */
export function renderEmailTemplate(
  template: EmailTemplateKey,
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const key = template.trim().toLowerCase();
  const renderer = RENDERERS[key];
  if (renderer) {
    return renderer(data, subject);
  }
  return renderFallback(key, data, subject);
}

export {
  renderBaseEmail,
  baseEmailFooterText,
  type BaseEmailOptions,
} from "@/src/lib/email/templates/base-template";
export { getEmailBrand, type EmailBrand } from "@/src/lib/email/templates/brand";
export {
  emailButton,
  emailDetailTable,
  emailDivider,
  emailHeading,
  emailMuted,
  emailParagraph,
  plainTextBlock,
} from "@/src/lib/email/templates/components";
export { renderCandidateStageUpdateEmail } from "@/src/lib/email/templates/candidate-stage-update";
export { renderStageChangedEmail } from "@/src/lib/email/templates/stage-changed";
export {
  renderInterviewScheduledEmail,
  formatInterviewWhen,
} from "@/src/lib/email/templates/interview-scheduled";
export {
  parseInterviewSchedule,
  resolveInterviewer,
  resolveMeetingLink,
} from "@/src/lib/email/templates/interview-schedule-fields";
export { renderOfferSentEmail } from "@/src/lib/email/templates/offer-sent";
export {
  resolveOfferDetailsSummary,
  resolveOfferNextSteps,
} from "@/src/lib/email/templates/offer-sent-fields";
export { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
export type { RenderedEmail, EmailTemplateRenderer } from "@/src/lib/email/templates/types";
