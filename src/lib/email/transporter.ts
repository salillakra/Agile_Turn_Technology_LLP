/**
 * Outbound email provider gate.
 * Supports both Nodemailer SMTP transport (e.g. Brevo SMTP relay / Resend / Custom SMTP)
 * and Brevo REST API SDK (@getbrevo/brevo).
 */
import nodemailer, { type Transporter } from "nodemailer";
import { BrevoClient, BrevoError } from "@getbrevo/brevo";
import { redactEmailSecretsInText } from "@/src/lib/email/email-security";
import {
  describeBrevoEnvForLogs,
  resolveBrevoEnvConfig,
  validateBrevoEnvConfig,
  type BrevoEnvConfig,
} from "@/src/lib/email/brevo-env";
import {
  describeSmtpEnvForLogs,
  resolveSmtpEnvConfig,
  validateSmtpEnvConfig,
  type SmtpEnvConfig,
} from "@/src/lib/email/smtp-env";

let cachedNodemailerTransporter: Transporter | null = null;
let cachedBrevoClient: BrevoClient | null = null;

/** @deprecated Prefer {@link BrevoEnvConfig} / {@link SmtpEnvConfig}. */
export type SmtpConfig = BrevoEnvConfig | SmtpEnvConfig;

/**
 * True when SMTP settings or Brevo API key are configured.
 * Does not imply outbound sending is enabled — see {@link isEmailSendingEnabled}.
 */
export function isSmtpConfigured(): boolean {
  return resolveSmtpEnvConfig() != null || resolveBrevoEnvConfig() != null;
}

/** @alias isSmtpConfigured */
export function isOutboundEmailConfigured(): boolean {
  return isSmtpConfigured();
}

/**
 * Outbound sends require SMTP/Brevo config and `EMAIL_SEND_ENABLED=1|true|yes`.
 */
export function isEmailSendingEnabled(): boolean {
  if (!isSmtpConfigured()) return false;
  const flag = process.env.EMAIL_SEND_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function resolveSmtpConfig(): SmtpEnvConfig | BrevoEnvConfig | null {
  return resolveSmtpEnvConfig() ?? resolveBrevoEnvConfig();
}

export function getNodemailerTransporter(): Transporter {
  if (cachedNodemailerTransporter) return cachedNodemailerTransporter;

  const config = resolveSmtpEnvConfig();
  if (!config) {
    throw new Error("SMTP is not configured. Set SMTP_HOST and SMTP_FROM.");
  }

  cachedNodemailerTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.password
      ? { auth: { user: config.user, pass: config.password } }
      : {}),
  });

  return cachedNodemailerTransporter;
}

export function getBrevoClient(): BrevoClient {
  if (cachedBrevoClient) return cachedBrevoClient;

  const config = resolveBrevoEnvConfig();
  const validationError = validateBrevoEnvConfig(config);
  if (validationError || !config) {
    throw new Error(
      validationError ??
        "Brevo API is not configured. Set BREVO_API_KEY and BREVO_FROM."
    );
  }

  cachedBrevoClient = new BrevoClient({
    apiKey: config.apiKey,
    timeoutInSeconds: 30,
    maxRetries: 1,
  });
  return cachedBrevoClient;
}

export type SmtpVerifyResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code?: string };

/**
 * Check SMTP or Brevo API connection configuration.
 */
export async function verifySmtpConnection(): Promise<SmtpVerifyResult> {
  const smtpConfig = resolveSmtpEnvConfig();
  if (smtpConfig) {
    try {
      const transporter = getNodemailerTransporter();
      await transporter.verify();
      return {
        ok: true,
        message: `SMTP connection verified OK (${describeSmtpEnvForLogs(smtpConfig)})`,
      };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        message: `SMTP verify failed: ${redactEmailSecretsInText(raw)}`,
      };
    }
  }

  const brevoConfig = resolveBrevoEnvConfig();
  const validationError = validateBrevoEnvConfig(brevoConfig);
  if (validationError || !brevoConfig) {
    return { ok: false, message: validationError ?? "Email transport not configured" };
  }

  try {
    getBrevoClient();
    return {
      ok: true,
      message: `Brevo API config OK (${describeBrevoEnvForLogs(brevoConfig)})`,
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: error instanceof BrevoError ? String(error.statusCode) : undefined,
      message: `Brevo verify failed: ${redactEmailSecretsInText(raw)}`,
    };
  }
}

export function resetEmailTransporter(): void {
  if (cachedNodemailerTransporter) {
    try {
      cachedNodemailerTransporter.close();
    } catch {
      /* ignore */
    }
    cachedNodemailerTransporter = null;
  }
  cachedBrevoClient = null;
}

export async function closeEmailTransporter(): Promise<void> {
  resetEmailTransporter();
}

/** Return active Nodemailer transporter or fail gracefully. */
export function getEmailTransporter(): Transporter {
  return getNodemailerTransporter();
}
