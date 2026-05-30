import type { EmailJobPayload } from "@/src/lib/queues/email-queue";
import {
  permanentWorkerError,
  transientWorkerError,
} from "@/src/lib/queues/workers/worker-errors";
import { renderEmailTemplate } from "@/src/lib/email/templates";
import { redactEmailSecretsInText } from "@/src/lib/email/email-security";
import {
  getEmailTransporter,
  isEmailSendingEnabled,
  resolveSmtpConfig,
} from "@/src/lib/email/transporter";

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

const PERMANENT_SMTP_CODES = new Set([
  "EAUTH",
  "EENVELOPE",
  "EMESSAGE",
  "ENOENT",
]);

function classifySendError(error: unknown): Error {
  if (error instanceof Error && error.name === "UnrecoverableError") {
    return error;
  }

  const code =
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;

  const responseCode =
    typeof error === "object" &&
    error != null &&
    "responseCode" in error &&
    typeof (error as { responseCode: unknown }).responseCode === "number"
      ? (error as { responseCode: number }).responseCode
      : undefined;

  const safeMessage = redactEmailSecretsInText(
    error instanceof Error ? error.message : String(error)
  );

  if (code && PERMANENT_SMTP_CODES.has(code)) {
    return permanentWorkerError(`SMTP permanent error (${code}): ${safeMessage}`, error);
  }

  if (responseCode != null && responseCode >= 500 && responseCode < 600) {
    return transientWorkerError(`SMTP server error (${responseCode}): ${safeMessage}`, error);
  }

  return transientWorkerError(`SMTP send failed: ${safeMessage}`, error);
}

function assertSendingEnabled(): void {
  if (!isEmailSendingEnabled()) {
    throw permanentWorkerError(
      "Email sending is disabled (set SMTP_HOST, SMTP_FROM, SMTP_PASSWORD as needed, then EMAIL_SEND_ENABLED=1)"
    );
  }
}

/**
 * Central SMTP send utility (nodemailer). All outbound mail goes through here.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  assertSendingEnabled();

  const smtp = resolveSmtpConfig();
  if (!smtp) {
    throw permanentWorkerError("SMTP configuration is incomplete");
  }

  const transporter = getEmailTransporter();

  try {
    const info = await transporter.sendMail({
      from: smtp.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    const messageId =
      typeof info.messageId === "string" && info.messageId.length > 0
        ? info.messageId
        : "unknown";

    const accepted = Array.isArray(info.accepted)
      ? info.accepted.map(String)
      : [params.to];

    return { messageId, accepted };
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

/** Worker no-op when SMTP is disabled (dev). */
export function shouldSkipEmailSend(): boolean {
  return !isEmailSendingEnabled();
}
