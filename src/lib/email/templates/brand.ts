/**
 * Brand tokens for transactional email (override via env).
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

function env(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : fallback;
}

/** Resolved once per process; safe to call from template renderers. */
export function getEmailBrand(): EmailBrand {
  return {
    name: env("EMAIL_BRAND_NAME", "Agile Turn"),
    tagline: env("EMAIL_BRAND_TAGLINE", "Recruitment Suite"),
    productName: env("EMAIL_PRODUCT_NAME", "Agile Turn Recruitment"),
    primaryColor: env("EMAIL_BRAND_PRIMARY", "#0f766e"),
    primaryColorDark: env("EMAIL_BRAND_PRIMARY_DARK", "#0d5c56"),
    accentColor: env("EMAIL_BRAND_ACCENT", "#14b8a6"),
    backgroundColor: env("EMAIL_BRAND_BG", "#f1f5f9"),
    surfaceColor: env("EMAIL_BRAND_SURFACE", "#ffffff"),
    textColor: env("EMAIL_BRAND_TEXT", "#0f172a"),
    mutedColor: env("EMAIL_BRAND_MUTED", "#64748b"),
    borderColor: env("EMAIL_BRAND_BORDER", "#e2e8f0"),
    appUrl: env("EMAIL_APP_URL", env("NEXTAUTH_URL", "http://localhost:3000")).replace(
      /\/$/,
      ""
    ),
    supportEmail: env("EMAIL_SUPPORT", "support@agileturn.com"),
    logoUrl: process.env.EMAIL_LOGO_URL?.trim() || null,
  };
}

export function brandFooterLine(brand: EmailBrand): string {
  return `© ${new Date().getFullYear()} ${brand.name} · ${brand.tagline}`;
}
