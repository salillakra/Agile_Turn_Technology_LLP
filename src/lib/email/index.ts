/**
 * Transactional email infrastructure (Brevo API + templates).
 *
 * - `brevo-env.ts` / `transporter.ts` — Brevo client + send gate
 * - `email-security.ts` — SPF/DKIM/DMARC guidance, secret redaction, env validation
 * - `templates/` — HTML/text renderers per `EmailTemplateKey`
 * - `send-email.ts` — single send entry point for workers
 */

export {
  EMAIL_AUTHENTICATION_PRACTICES,
  EMAIL_ENV_SECURITY_PRACTICES,
  EMAIL_SECRET_ENV_KEYS,
  collectEmailSecretEnvValues,
  domainFromEmailAddress,
  parseEmailFromAddress,
  redactEmailSecretsInText,
  sendingDomainFromFromHeader,
  validateEmailSecurityConfig,
  type EmailSecurityValidation,
} from "@/src/lib/email/email-security";

export {
  describeBrevoEnvForLogs,
  resolveBrevoEnvConfig,
  validateBrevoEnvConfig,
  type BrevoEnvConfig,
} from "@/src/lib/email/brevo-env";

export {
  describeSmtpEnvForLogs,
  resolveSmtpEnvConfig,
  validateSmtpEnvConfig,
  type SmtpEnvConfig,
} from "@/src/lib/email/smtp-env";

export {
  closeEmailTransporter,
  getBrevoClient,
  getEmailTransporter,
  isEmailSendingEnabled,
  isOutboundEmailConfigured,
  isSmtpConfigured,
  resetEmailTransporter,
  resolveSmtpConfig,
  verifySmtpConnection,
  type SmtpConfig,
  type SmtpVerifyResult,
} from "@/src/lib/email/transporter";

export {
  sendEmail,
  sendTransactionalEmail,
  shouldSkipEmailSend,
  type SendEmailParams,
  type SendEmailResult,
  type SendTransactionalEmailResult,
} from "@/src/lib/email/send-email";

export {
  renderEmailTemplate,
  renderBaseEmail,
  getEmailBrand,
  resolveEmailAppUrl,
  buildRenderedEmail,
  renderCandidateStageUpdateEmail,
  renderStageChangedEmail,
  renderInterviewScheduledEmail,
  renderOfferSentEmail,
  type RenderedEmail,
  type EmailBrand,
  type BaseEmailOptions,
} from "@/src/lib/email/templates";

export {
  buildInterviewScheduledSubject,
  buildInterviewReminderSubject,
  buildOfferLetterSubject,
} from "@/src/lib/application-stage-labels";

export {
  createEmailLogPending,
  findEmailLogByBullmqJobId,
  listEmailLogs,
  markEmailLogFailed,
  markEmailLogSent,
  recordEmailLogPendingForEnqueue,
  syncEmailLogAfterWorkerAttempt,
  type CreateEmailLogInput,
  type ListEmailLogsFilter,
} from "@/src/lib/email/email-log-service";

export type { EmailDeliveryStatus, EmailLog } from "@prisma/client";

export {
  getEmailMonitoringDashboard,
  parseEmailMonitoringFilter,
  defaultMonitoringRange,
} from "@/src/lib/email/email-monitoring-service";
export type {
  EmailMonitoringDashboard,
  EmailMonitoringFilter,
  EmailMonitoringSummary,
  EmailMonitoringTypeFilter,
} from "@/src/lib/email/email-monitoring-types";
export {
  EMAIL_TYPE_LABELS,
  labelForEmailType,
  resolveEmailTypeFilter,
} from "@/src/lib/email/email-template-taxonomy";

export { recordEmailActivityForDelivery } from "@/src/lib/email/email-activity-log";
export type { EmailActivityOutcome } from "@/src/lib/email/email-activity-log";
export {
  ACTIVITY_ACTION_EMAIL_SENT,
  ACTIVITY_ACTION_EMAIL_FAILED,
  ACTIVITY_ACTION_INTERVIEW_REMINDER_SENT,
  buildEmailActivityDetails,
} from "@/src/lib/activity-log-details";
export type { EmailActivityDetails } from "@/src/lib/activity-log-details";

export {
  resolveEmailPreferenceCategory,
  DEFAULT_EMAIL_PREFERENCE_CHANNELS,
  type EmailPreferenceCategory,
  type EmailPreferenceChannel,
} from "@/src/lib/email/email-preference-categories";

export {
  canSendEmailToRecipient,
  getEmailPreferencesByEmail,
  getEmailPreferencesForUser,
  getEmailPreferencesForCandidate,
  upsertEmailPreferences,
  linkEmailPreferenceToUser,
  linkEmailPreferenceToCandidate,
  type EmailPreferenceDto,
  type CanSendEmailResult,
  type UpsertEmailPreferenceInput,
} from "@/src/lib/email/email-preference-service";
