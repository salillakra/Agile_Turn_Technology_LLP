import { brandFooterLine, getEmailBrand, type EmailBrand } from "@/src/lib/email/templates/brand";
import { EMAIL_FONT_STACK } from "@/src/lib/email/templates/components";
import { escapeHtml } from "@/src/lib/email/templates/layout";

export type BaseEmailOptions = {
  /** In-body headline (header area). */
  title: string;
  /** Main HTML fragment (paragraphs, buttons, tables). */
  bodyHtml: string;
  /** Inbox preview / preheader (hidden in body). */
  preheader?: string;
  /** Optional subtitle under the brand header. */
  headerSubtitle?: string;
  /** Extra footer HTML inside the footer band (escaped as plain text if no HTML intended). */
  footerNote?: string;
  /** Override brand (tests). */
  brand?: EmailBrand;
};

function renderHeader(brand: EmailBrand, subtitle?: string): string {
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" width="160" height="auto" style="display:block;max-width:160px;width:160px;height:auto;border:0;" />`
    : `<span style="font-family:${EMAIL_FONT_STACK};font-size:18px;font-weight:600;letter-spacing:-0.03em;color:#FFFFFF;">${escapeHtml(brand.name)}</span>`;

  const subtitleRow = subtitle
    ? `<tr>
<td class="email-padding" style="padding:0 32px 20px;font-family:${EMAIL_FONT_STACK};font-size:12px;line-height:18px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.55);">
${escapeHtml(subtitle)}
</td>
</tr>`
    : "";

  // Logo art is dark — sit it on charcoal so the mark reads correctly in clients.
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111111;border-radius:8px 8px 0 0;">
<tr>
<td class="email-padding" style="padding:28px 32px ${subtitle ? "12px" : "28px"};">
${logo}
</td>
</tr>
${subtitleRow}
</table>`;
}

function renderFooter(brand: EmailBrand, footerNote?: string): string {
  const note = footerNote
    ? `<p style="margin:0 0 14px;font-family:${EMAIL_FONT_STACK};font-size:12px;line-height:1.55;color:${brand.mutedColor};">${escapeHtml(footerNote)}</p>`
    : "";

  const support = brand.supportEmail
    ? `<p style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};font-size:12px;line-height:1.55;color:${brand.mutedColor};">
Questions? <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${brand.accentColor};text-decoration:none;">${escapeHtml(brand.supportEmail)}</a>
</p>`
    : "";

  // Prefer branded label over dumping a raw URL (and never advertise localhost).
  const isLocal =
    !brand.appUrl || /localhost|127\.0\.0\.1/i.test(brand.appUrl);
  const appLink =
    brand.appUrl && !isLocal
      ? `<p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:12px;line-height:1.55;">
<a href="${escapeHtml(brand.appUrl)}" style="color:${brand.accentColor};text-decoration:none;">${escapeHtml(brand.name)}</a>
</p>`
      : "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FBFBFA;border-top:1px solid ${brand.borderColor};border-radius:0 0 8px 8px;">
<tr>
<td class="email-padding" style="padding:24px 32px;">
${note}
${support}
<p style="margin:14px 0 8px;font-family:${EMAIL_FONT_STACK};font-size:11px;line-height:16px;color:${brand.mutedColor};">
${escapeHtml(brandFooterLine(brand))}
</p>
${appLink}
</td>
</tr>
</table>`;
}

/**
 * Responsive, branded HTML shell for all transactional templates.
 * Table-based layout for client compatibility; mobile rules in `<style>`.
 */
export function renderBaseEmail(options: BaseEmailOptions): string {
  const brand = options.brand ?? getEmailBrand();
  const title = escapeHtml(options.title);
  const preheader = options.preheader
    ? escapeHtml(options.preheader)
    : escapeHtml(options.title);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${title}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style type="text/css">
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  @media only screen and (max-width: 620px) {
    .email-container { width: 100% !important; max-width: 100% !important; }
    .email-padding { padding-left: 20px !important; padding-right: 20px !important; }
    .fluid { width: 100% !important; max-width: 100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${brand.backgroundColor};color:${brand.textColor};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${brand.backgroundColor};">
${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${brand.backgroundColor};">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" class="email-container" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;margin:0 auto;border:1px solid ${brand.borderColor};border-radius:8px;overflow:hidden;">
<tr>
<td>
${renderHeader(brand, options.headerSubtitle)}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${brand.surfaceColor};">
<tr>
<td class="email-padding" style="padding:36px 32px;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.6;color:${brand.textColor};">
<h1 style="margin:0 0 20px;font-family:${EMAIL_FONT_STACK};font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${brand.textColor};">${title}</h1>
${options.bodyHtml}
</td>
</tr>
</table>
${renderFooter(brand, options.footerNote)}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

export function baseEmailFooterText(brand?: EmailBrand): string {
  const b = brand ?? getEmailBrand();
  const isLocal = !b.appUrl || /localhost|127\.0\.0\.1/i.test(b.appUrl);
  return [
    brandFooterLine(b),
    b.supportEmail ? `Support: ${b.supportEmail}` : "",
    b.appUrl && !isLocal ? b.appUrl : "",
  ]
    .filter(Boolean)
    .join("\n");
}
