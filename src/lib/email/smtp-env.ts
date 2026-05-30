/**
 * SMTP environment reads — secrets are never logged from this module.
 */

export type SmtpEnvConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

function nonEmpty(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parsePort(raw: string | undefined, defaultPort: number): number {
  const trimmed = nonEmpty(raw);
  if (!trimmed) return defaultPort;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultPort;
}

/**
 * Read SMTP settings from process env. Returns null if required fields are missing.
 * Supports `SMTP_PASSWORD` (preferred). Does not expose the password in return value
 * to callers that only need public fields — use {@link resolveSmtpEnvConfig} for sending.
 */
export function resolveSmtpEnvConfig(): SmtpEnvConfig | null {
  const host = nonEmpty(process.env.SMTP_HOST);
  const from = nonEmpty(process.env.SMTP_FROM);
  if (!host || !from) return null;

  const port = parsePort(process.env.SMTP_PORT, 587);
  const secure =
    process.env.SMTP_SECURE != null
      ? parseBool(process.env.SMTP_SECURE, false)
      : port === 465;

  const user = nonEmpty(process.env.SMTP_USER);
  const password = nonEmpty(process.env.SMTP_PASSWORD);

  if (user && !password) {
    return null;
  }

  return {
    host,
    port,
    secure,
    from,
    ...(user ? { user, password } : password ? { password } : {}),
  };
}

/** Safe summary for logs and health checks (no password). */
export function describeSmtpEnvForLogs(config: SmtpEnvConfig): string {
  const auth =
    config.user != null
      ? `auth=user:${config.user} (password set)`
      : "auth=none";
  return `host=${config.host} port=${config.port} secure=${config.secure} from=${config.from} ${auth}`;
}

export function validateSmtpEnvConfig(config: SmtpEnvConfig | null): string | null {
  if (!config) {
    return "SMTP_HOST and SMTP_FROM are required; SMTP_USER requires SMTP_PASSWORD.";
  }
  return null;
}
