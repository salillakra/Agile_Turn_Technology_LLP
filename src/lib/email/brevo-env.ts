/**
 * Brevo transactional API env — secrets are never logged from this module.
 */

export type BrevoEnvConfig = {
  apiKey: string;
  /** Full From header, e.g. `Agile Turn <noreply@example.com>` or bare email. */
  from: string;
  /** Parsed sender email for Brevo API. */
  senderEmail: string;
  /** Optional display name from From header. */
  senderName?: string;
};

function nonEmpty(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

const FROM_RE = /^(?:"?([^"<]*)"?\s*)?<?([^>\s]+@[^>\s]+)>?$/;

function parseSender(fromHeader: string): { email: string; name?: string } | null {
  const trimmed = fromHeader.trim();
  if (!trimmed) return null;
  const m = FROM_RE.exec(trimmed);
  if (!m) return null;
  const email = (m[2] ?? "").trim().toLowerCase();
  const name = (m[1] ?? "").trim() || undefined;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return name ? { email, name } : { email };
}

/**
 * Read Brevo settings. Requires `BREVO_API_KEY` and a from address
 * (`BREVO_FROM` preferred, else `SMTP_FROM` / `EMAIL_FROM`).
 */
export function resolveBrevoEnvConfig(): BrevoEnvConfig | null {
  const apiKey = nonEmpty(process.env.BREVO_API_KEY);
  const from =
    nonEmpty(process.env.BREVO_FROM) ||
    nonEmpty(process.env.SMTP_FROM) ||
    nonEmpty(process.env.EMAIL_FROM);
  if (!apiKey || !from) return null;

  const sender = parseSender(from);
  if (!sender) return null;

  return {
    apiKey,
    from,
    senderEmail: sender.email,
    ...(sender.name ? { senderName: sender.name } : {}),
  };
}

export function describeBrevoEnvForLogs(config: BrevoEnvConfig): string {
  return `provider=brevo from=${config.from} sender=${config.senderEmail} apiKey=set`;
}

export function validateBrevoEnvConfig(config: BrevoEnvConfig | null): string | null {
  if (!config) {
    return "BREVO_API_KEY and BREVO_FROM (or SMTP_FROM) are required.";
  }
  return null;
}
