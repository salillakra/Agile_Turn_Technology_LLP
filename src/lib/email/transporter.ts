/**
 * Outbound email provider gate (Brevo transactional API).
 * Kept file name `transporter.ts` for existing imports; no nodemailer pool.
 */
import { BrevoClient, BrevoError } from "@getbrevo/brevo";
import { redactEmailSecretsInText } from "@/src/lib/email/email-security";
import {
  describeBrevoEnvForLogs,
  resolveBrevoEnvConfig,
  validateBrevoEnvConfig,
  type BrevoEnvConfig,
} from "@/src/lib/email/brevo-env";

let cachedClient: BrevoClient | null = null;

/** @deprecated Prefer {@link BrevoEnvConfig} / {@link resolveBrevoEnvConfig}. */
export type SmtpConfig = BrevoEnvConfig;
export type SmtpEnvConfig = BrevoEnvConfig;

/**
 * True when Brevo API key + from address are present.
 * Does not imply outbound sending is enabled — see {@link isEmailSendingEnabled}.
 */
export function isSmtpConfigured(): boolean {
  return resolveBrevoEnvConfig() != null;
}

/** @alias isSmtpConfigured */
export function isOutboundEmailConfigured(): boolean {
  return isSmtpConfigured();
}

/**
 * Outbound sends require Brevo config and `EMAIL_SEND_ENABLED=1|true|yes`.
 */
export function isEmailSendingEnabled(): boolean {
  if (!isSmtpConfigured()) return false;
  const flag = process.env.EMAIL_SEND_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function resolveSmtpConfig(): BrevoEnvConfig | null {
  return resolveBrevoEnvConfig();
}

export function getBrevoClient(): BrevoClient {
  if (cachedClient) return cachedClient;

  const config = resolveBrevoEnvConfig();
  const validationError = validateBrevoEnvConfig(config);
  if (validationError || !config) {
    throw new Error(
      validationError ??
        "Brevo is not configured. Set BREVO_API_KEY and BREVO_FROM (or SMTP_FROM)."
    );
  }

  cachedClient = new BrevoClient({
    apiKey: config.apiKey,
    timeoutInSeconds: 30,
    maxRetries: 1,
  });
  return cachedClient;
}

export type SmtpVerifyResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code?: string };

/**
 * Lightweight config check (does not call Brevo). Prefer a real send for connectivity tests.
 */
export async function verifySmtpConnection(): Promise<SmtpVerifyResult> {
  const config = resolveBrevoEnvConfig();
  const validationError = validateBrevoEnvConfig(config);
  if (validationError || !config) {
    return { ok: false, message: validationError ?? "Brevo not configured" };
  }

  try {
    getBrevoClient();
    return {
      ok: true,
      message: `Brevo config OK (${describeBrevoEnvForLogs(config)})`,
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
  cachedClient = null;
}

/** No pooled connections for HTTP API — clears cached client. */
export async function closeEmailTransporter(): Promise<void> {
  resetEmailTransporter();
}

/** @deprecated Nodemailer removed; use {@link getBrevoClient}. */
export function getEmailTransporter(): never {
  throw new Error(
    "getEmailTransporter removed — outbound mail uses Brevo API (getBrevoClient)."
  );
}
