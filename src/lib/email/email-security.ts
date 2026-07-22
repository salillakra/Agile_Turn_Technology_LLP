/**
 * Email security best practices and secret handling for outbound mail.
 *
 * DNS authentication (SPF, DKIM, DMARC) is configured at your domain registrar or DNS
 * provider — not via application env vars. See {@link EMAIL_AUTHENTICATION_PRACTICES} and
 * {@link EMAIL_ENV_SECURITY_PRACTICES}.
 */

/** Env var names that must never appear in logs, API responses, or ActivityLog details. */
export const EMAIL_SECRET_ENV_KEYS = [
  "BREVO_API_KEY",
  "SMTP_PASSWORD",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "POSTMARK_SERVER_TOKEN",
  "AWS_SECRET_ACCESS_KEY",
] as const;

/**
 * SPF — authorize which hosts may send mail for your domain.
 * Publish a TXT record at the domain used in `SMTP_FROM` (e.g. `example.com`).
 */
export const EMAIL_AUTHENTICATION_PRACTICES = {
  spf: {
    recordType: "TXT",
    host: "@",
    purpose:
      "Lists IP addresses and include targets allowed to send as your domain. Receiving servers check that the connecting server is authorized.",
    example:
      'v=spf1 include:_spf.google.com include:amazonses.com ~all',
    notes: [
      "Use `-all` (fail) only after all legitimate senders are listed; `~all` (softfail) is safer while testing.",
      "Include your SMTP/API provider's SPF include (e.g. SendGrid, SES, Postmark, Resend publish docs).",
      "One SPF TXT record per domain — merge includes into a single record.",
    ],
  },
  dkim: {
    recordType: "TXT",
    host: "selector._domainkey",
    purpose:
      "Cryptographic signature on each message. Receivers verify with your public key in DNS to prove the message was not altered in transit.",
    notes: [
      "Enable DKIM in your provider dashboard; they supply selector + CNAME/TXT values.",
      "Rotate keys per provider guidance; use a dedicated selector per environment if supported.",
      "Align the signing domain with the domain in `From:` (see DMARC alignment).",
    ],
  },
  dmarc: {
    recordType: "TXT",
    host: "_dmarc",
    purpose:
      "Policy for what receivers should do when SPF or DKIM alignment fails, plus reporting addresses for aggregate/forensic reports.",
    example: "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com; pct=100",
    notes: [
      "Start with `p=none` and monitor `rua` reports before moving to `quarantine` or `reject`.",
      "Requires SPF and/or DKIM alignment with the From header domain (organizational domain).",
      "Use a dedicated mailbox or report service for `rua` / `ruf` — reports can be large.",
    ],
  },
  whyAuthenticationImprovesDeliverability:
    "Mailbox providers (Google, Microsoft, Yahoo) weigh authenticated mail heavily. SPF reduces spoofing of your domain; DKIM proves message integrity; DMARC tells receivers how to treat failures and gives you visibility. Without them, messages are more likely to be spam-foldered or rejected, especially for transactional volume from a new domain. Authentication does not guarantee inbox placement but is a baseline requirement for reliable recruitment email (offers, interviews, password reset).",
} as const;

/**
 * Application-side protection for credentials and provider API keys.
 */
export const EMAIL_ENV_SECURITY_PRACTICES = {
  storage: [
    "Keep `BREVO_API_KEY` (and any legacy SMTP passwords) only in `.env`, secrets manager, or CI/CD secrets — never in git.",
    "Use different credentials per environment (dev/staging/production).",
    "Restrict production secrets to the worker and API processes that send mail — not the browser.",
  ],
  runtime: [
    "Never log raw env values listed in EMAIL_SECRET_ENV_KEYS; use redactEmailSecretsInText() before logging errors.",
    "Use describeBrevoEnvForLogs() for health output — it omits API keys.",
    "Set EMAIL_SEND_ENABLED=1 only when Brevo is configured; keep disabled in local DB-only dev.",
  ],
  optionalEnv: {
    EMAIL_SENDING_DOMAIN:
      "Optional. Domain part of BREVO_FROM / SMTP_FROM (e.g. example.com) for startup validation warnings when misaligned.",
  },
} as const;

const EMAIL_ADDRESS_RE = /<([^>]+)>|^([^\s<]+@[^\s>]+)$/;

/** Extract bare email from `Name <addr@domain.com>` or `addr@domain.com`. */
export function parseEmailFromAddress(fromHeader: string): string | null {
  const trimmed = fromHeader.trim();
  if (!trimmed) return null;
  const bracket = EMAIL_ADDRESS_RE.exec(trimmed);
  const addr = (bracket?.[1] ?? bracket?.[2] ?? trimmed).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at <= 0 || at === addr.length - 1) return null;
  return addr;
}

/** Domain part of an address (organizational domain for DMARC alignment checks). */
export function domainFromEmailAddress(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at <= 0) return null;
  return address.slice(at + 1).toLowerCase();
}

/** Domain from `SMTP_FROM` / `EMAIL_FROM` style header value. */
export function sendingDomainFromFromHeader(fromHeader: string): string | null {
  const email = parseEmailFromAddress(fromHeader);
  return email ? domainFromEmailAddress(email) : null;
}

/** Non-empty secret values from process env (for redaction only — do not log this array). */
export function collectEmailSecretEnvValues(): string[] {
  const values: string[] = [];
  for (const key of EMAIL_SECRET_ENV_KEYS) {
    const raw = process.env[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      values.push(raw.trim());
    }
  }
  return values;
}

/**
 * Replace known email credentials in a string before logging or returning errors.
 */
export function redactEmailSecretsInText(text: string): string {
  let out = text;
  for (const secret of collectEmailSecretEnvValues()) {
    if (secret.length > 0 && out.includes(secret)) {
      out = out.split(secret).join("[REDACTED]");
    }
  }
  return out;
}

export type EmailSecurityValidation = {
  warnings: string[];
};

/**
 * Non-blocking checks for misconfiguration. Safe to call from health checks or worker startup.
 */
export function validateEmailSecurityConfig(): EmailSecurityValidation {
  const warnings: string[] = [];
  const from =
    process.env.BREVO_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "";
  const declaredDomain = process.env.EMAIL_SENDING_DOMAIN?.trim().toLowerCase();

  if (from) {
    const fromDomain = sendingDomainFromFromHeader(from);
    if (!fromDomain) {
      warnings.push("From address is set but could not parse a valid email address.");
    } else if (declaredDomain && fromDomain !== declaredDomain) {
      warnings.push(
        `EMAIL_SENDING_DOMAIN (${declaredDomain}) does not match From domain (${fromDomain}).`
      );
    }

    if (process.env.NODE_ENV === "production") {
      if (!declaredDomain) {
        warnings.push(
          "Production: set EMAIL_SENDING_DOMAIN to match BREVO_FROM / SMTP_FROM for alignment checks and runbooks."
        );
      }
      if (!process.env.BREVO_API_KEY?.trim()) {
        warnings.push("Production: BREVO_API_KEY is not set — outbound email will not send.");
      }
    }
  }

  return { warnings };
}
