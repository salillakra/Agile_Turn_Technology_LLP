import type { EmailJobPayload } from "@/src/lib/queues/email-queue";
import {
  permanentWorkerError,
  transientWorkerError,
} from "@/src/lib/queues/workers/worker-errors";
import { renderEmailTemplate } from "@/src/lib/email/templates";
import { redactEmailSecretsInText } from "@/src/lib/email/email-security";
import { resolveBrevoEnvConfig } from "@/src/lib/email/brevo-env";
import { resolveSmtpEnvConfig } from "@/src/lib/email/smtp-env";
import {
  getBrevoClient,
  getNodemailerTransporter,
  isEmailSendingEnabled,
} from "@/src/lib/email/transporter";
import { BrevoError } from "@getbrevo/brevo";

export type SendEmailResult = {
  messageId: string;
  accepted: string[];
};

/** @alias SendEmailResult */
export type SendTransactionalEmailResult = SendEmailResult;

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function classifySendError(error: unknown): Error {
  if (error instanceof Error && error.name === "UnrecoverableError") {
    return error;
  }

  const safeMessage = redactEmailSecretsInText(
    error instanceof Error ? error.message : String(error)
  );

  if (error instanceof BrevoError) {
    const status = error.statusCode;
    if (status === 401 || status === 403 || status === 400 || status === 422) {
      return permanentWorkerError(
        `Brevo permanent error (${status}): ${safeMessage}`,
        error
      );
    }
    if (status === 429 || (status != null && status >= 500)) {
      return transientWorkerError(
        `Brevo transient error (${status}): ${safeMessage}`,
        error
      );
    }
  }

  return transientWorkerError(`Email send failed: ${safeMessage}`, error);
}

function assertSendingEnabled(): void {
  if (!isEmailSendingEnabled()) {
    throw permanentWorkerError(
      "Email sending is disabled (set SMTP_HOST/SMTP_FROM or BREVO_API_KEY, then EMAIL_SEND_ENABLED=1)"
    );
  }
}

/**
 * Central outbound send via Nodemailer SMTP or Brevo transactional API.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  assertSendingEnabled();

  // Primary Path: Nodemailer SMTP transport (supports Brevo SMTP relay, Resend SMTP, Amazon SES, etc.)
  const smtpConfig = resolveSmtpEnvConfig();
  if (smtpConfig) {
    try {
      const transporter = getNodemailerTransporter();
      const info = await transporter.sendMail({
        from: smtpConfig.from,
        to: params.to.trim(),
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      const messageId =
        typeof info.messageId === "string" && info.messageId.length > 0
          ? info.messageId
          : "unknown";

      return { messageId, accepted: [params.to.trim()] };
    } catch (err) {
      throw classifySendError(err);
    }
  }

  // Secondary Path: Brevo REST API v3 SDK (@getbrevo/brevo)
  const brevoConfig = resolveBrevoEnvConfig();
  if (brevoConfig) {
    try {
      const brevo = getBrevoClient();
      const result = await brevo.transactionalEmails.sendTransacEmail({
        subject: params.subject,
        htmlContent: params.html,
        textContent: params.text,
        sender: {
          email: brevoConfig.senderEmail,
          ...(brevoConfig.senderName ? { name: brevoConfig.senderName } : {}),
        },
        to: [{ email: params.to.trim() }],
      });

      const messageId =
        typeof result.messageId === "string" && result.messageId.length > 0
          ? result.messageId
          : "unknown";

      return { messageId, accepted: [params.to.trim()] };
    } catch (err) {
      throw classifySendError(err);
    }
  }

  throw permanentWorkerError("No valid email transport configuration found.");
}

/**
 * Queue job send path: render template → {@link sendEmail}.
 * Used by the BullMQ email worker (`processEmailJob`).
 */
export async function sendTransactionalEmail(
  payload: EmailJobPayload
): Promise<SendTransactionalEmailResult> {
  const rendered = renderEmailTemplate(
    payload.template,
    payload.data,
    payload.subject
  );

  return sendEmail({
    to: payload.recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

/** Worker no-op when email sending is disabled (dev). */
export function shouldSkipEmailSend(): boolean {
  return !isEmailSendingEnabled();
}
