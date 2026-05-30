import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { redactEmailSecretsInText } from "@/src/lib/email/email-security";
import {
  describeSmtpEnvForLogs,
  resolveSmtpEnvConfig,
  validateSmtpEnvConfig,
  type SmtpEnvConfig,
} from "@/src/lib/email/smtp-env";

let cachedTransporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

/** @deprecated Use {@link SmtpEnvConfig} */
export type SmtpConfig = SmtpEnvConfig;

/**
 * True when required SMTP env vars are present (`SMTP_HOST`, `SMTP_FROM`, and password if `SMTP_USER` set).
 * Does not imply outbound sending is enabled — see {@link isEmailSendingEnabled}.
 */
export function isSmtpConfigured(): boolean {
  return resolveSmtpEnvConfig() != null;
}

/**
 * Outbound sends are gated separately so the transporter can be verified without delivering mail.
 * Set `EMAIL_SEND_ENABLED=1` when ready to send from the email worker.
 */
export function isEmailSendingEnabled(): boolean {
  if (!isSmtpConfigured()) return false;
  const flag = process.env.EMAIL_SEND_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/** @alias resolveSmtpEnvConfig */
export function resolveSmtpConfig(): SmtpEnvConfig | null {
  return resolveSmtpEnvConfig();
}

function createTransportFromConfig(
  config: SmtpEnvConfig
): Transporter<SMTPTransport.SentMessageInfo> {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth:
      config.user && config.password
        ? { user: config.user, pass: config.password }
        : undefined,
  });
}

/**
 * Reusable lazily-initialized SMTP transporter (one instance per process).
 */
export function getEmailTransporter(): Transporter<SMTPTransport.SentMessageInfo> {
  if (cachedTransporter) return cachedTransporter;

  const config = resolveSmtpEnvConfig();
  const validationError = validateSmtpEnvConfig(config);
  if (validationError || !config) {
    throw new Error(
      validationError ??
        "SMTP is not configured. Set SMTP_HOST, SMTP_FROM, SMTP_PORT (optional), SMTP_USER + SMTP_PASSWORD (optional)."
    );
  }

  cachedTransporter = createTransportFromConfig(config);
  return cachedTransporter;
}

export type SmtpVerifyResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code?: string };

function sanitizeVerifyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactEmailSecretsInText(raw);
}

/**
 * Verifies SMTP connectivity (nodemailer `transporter.verify()`).
 * Does not send a message. Safe to call from health checks or startup scripts.
 */
export async function verifySmtpConnection(): Promise<SmtpVerifyResult> {
  const config = resolveSmtpEnvConfig();
  const validationError = validateSmtpEnvConfig(config);
  if (validationError || !config) {
    return { ok: false, message: validationError ?? "SMTP not configured" };
  }

  const transporter = getEmailTransporter();

  try {
    await transporter.verify();
    return {
      ok: true,
      message: `SMTP verify OK (${describeSmtpEnvForLogs(config)})`,
    };
  } catch (error) {
    const code =
      typeof error === "object" &&
      error != null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;

    return {
      ok: false,
      code,
      message: `SMTP verify failed: ${sanitizeVerifyErrorMessage(error)}`,
    };
  }
}

/** Drop cached transporter (tests, env reload, shutdown). */
export function resetEmailTransporter(): void {
  if (cachedTransporter) {
    try {
      cachedTransporter.close();
    } catch {
      /* ignore */
    }
  }
  cachedTransporter = null;
}

/** Close pooled SMTP connections (worker graceful shutdown). */
export async function closeEmailTransporter(): Promise<void> {
  resetEmailTransporter();
}
