import type { EmailJobPayload } from "@/src/lib/queues/email-queue";
import {
  permanentWorkerError,
  transientWorkerError,
} from "@/src/lib/queues/workers/worker-errors";
import { renderEmailTemplate } from "@/src/lib/email/templates";
import { redactEmailSecretsInText } from "@/src/lib/email/email-security";
import { resolveBrevoEnvConfig } from "@/src/lib/email/brevo-env";
import {
  getBrevoClient,
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

  return transientWorkerError(`Brevo send failed: ${safeMessage}`, error);
}

function assertSendingEnabled(): void {
  if (!isEmailSendingEnabled()) {
    throw permanentWorkerError(
      "Email sending is disabled (set BREVO_API_KEY, BREVO_FROM or SMTP_FROM, then EMAIL_SEND_ENABLED=1)"
    );
  }
}

/**
 * Central outbound send via Brevo transactional API. All pipeline mail goes through here.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  assertSendingEnabled();

  const config = resolveBrevoEnvConfig();
  if (!config) {
    throw permanentWorkerError("Brevo configuration is incomplete");
  }

  const brevo = getBrevoClient();

  try {
    const result = await brevo.transactionalEmails.sendTransacEmail({
      subject: params.subject,
      htmlContent: params.html,
      textContent: params.text,
      sender: {
        email: config.senderEmail,
        ...(config.senderName ? { name: config.senderName } : {}),
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

/** Worker no-op when Brevo is disabled (dev). */
export function shouldSkipEmailSend(): boolean {
  return !isEmailSendingEnabled();
}
