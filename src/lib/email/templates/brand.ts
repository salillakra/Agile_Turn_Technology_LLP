/**
 * Brand tokens for transactional email (override via env).
 * Minimal warm-monochrome defaults; logo defaults to `/agile_turn_logo.png` on the app origin.
 */

export type EmailBrand = {
  name: string;
  tagline: string;
  productName: string;
  primaryColor: string;
  primaryColorDark: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  appUrl: string;
  supportEmail: string;
  logoUrl: string | null;
};

function env(key: string, fallback = ""): string {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : fallback;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Public app origin for links in mail.
 * Order: EMAIL_APP_URL → NEXTAUTH_URL → SERVICE_URL_APP (Coolify) → COOLIFY_URL.
 * Localhost fallback only when NODE_ENV is not production.
 */
export function resolveEmailAppUrl(): string {
  const candidates = [
    env("EMAIL_APP_URL"),
    env("NEXTAUTH_URL"),
    env("SERVICE_URL_APP"),
    env("COOLIFY_URL"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      return stripTrailingSlash(u.origin);
    } catch {
      /* skip invalid */
    }
  }
  if (process.env.NODE_ENV === "production") {
    return "";
  }
  return "http://localhost:3000";
}

function resolveLogoUrl(appUrl: string): string | null {
  const explicit = env("EMAIL_LOGO_URL");
  if (explicit) return explicit;
  if (!appUrl || /localhost|127\.0\.0\.1/i.test(appUrl)) return null;
  return `${appUrl}/agile_turn_logo.png`;
}

/** Resolved once per call; safe to call from template renderers. */
export function getEmailBrand(): EmailBrand {
  const appUrl = resolveEmailAppUrl();
  return {
    name: env("EMAIL_BRAND_NAME", "Agile Turn"),
    tagline: env("EMAIL_BRAND_TAGLINE", "Recruitment Suite"),
    productName: env("EMAIL_PRODUCT_NAME", "Agile Turn Recruitment"),
    // Minimalist charcoal CTA; blue accent aligns with logo “Turn” mark
    primaryColor: env("EMAIL_BRAND_PRIMARY", "#111111"),
    primaryColorDark: env("EMAIL_BRAND_PRIMARY_DARK", "#000000"),
    accentColor: env("EMAIL_BRAND_ACCENT", "#0056B3"),
    backgroundColor: env("EMAIL_BRAND_BG", "#F7F6F3"),
    surfaceColor: env("EMAIL_BRAND_SURFACE", "#FFFFFF"),
    textColor: env("EMAIL_BRAND_TEXT", "#2F3437"),
    mutedColor: env("EMAIL_BRAND_MUTED", "#787774"),
    borderColor: env("EMAIL_BRAND_BORDER", "#EAEAEA"),
    appUrl,
    supportEmail: env("EMAIL_SUPPORT", "support@agileturn.com"),
    logoUrl: resolveLogoUrl(appUrl),
  };
}

export function brandFooterLine(brand: EmailBrand): string {
  return `© ${new Date().getFullYear()} ${brand.name} · ${brand.tagline}`;
}
