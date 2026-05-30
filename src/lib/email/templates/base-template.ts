import { brandFooterLine, getEmailBrand, type EmailBrand } from "@/src/lib/email/templates/brand";
import { escapeHtml } from "@/src/lib/email/templates/layout";

const FONT_STACK =
  "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

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
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" width="140" style="display:block;max-width:140px;height:auto;border:0;" />`
    : `<span style="font-family:${FONT_STACK};font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(brand.name)}</span>`;

  const subtitleRow = subtitle
    ? `<tr>
<td class="email-padding" style="padding:0 32px 20px;font-family:${FONT_STACK};font-size:13px;line-height:18px;color:rgba(255,255,255,0.85);">
${escapeHtml(subtitle)}
</td>
</tr>`
    : "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${brand.primaryColor};border-radius:8px 8px 0 0;">
<tr>
<td class="email-padding" style="padding:24px 32px 16px;">
${logo}
</td>
</tr>
${subtitleRow}
</table>`;
}

function renderFooter(brand: EmailBrand, footerNote?: string): string {
  const note = footerNote
    ? `<p style="margin:0 0 12px;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${brand.mutedColor};">${escapeHtml(footerNote)}</p>`
    : "";

  const support = brand.supportEmail
    ? `<p style="margin:0 0 8px;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${brand.mutedColor};">
Questions? <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${brand.primaryColor};text-decoration:none;">${escapeHtml(brand.supportEmail)}</a>
</p>`
    : "";

  const appLink = brand.appUrl
    ? `<p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:18px;">
<a href="${escapeHtml(brand.appUrl)}" style="color:${brand.primaryColor};text-decoration:none;">${escapeHtml(brand.appUrl)}</a>
</p>`
    : "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border-top:1px solid ${brand.borderColor};border-radius:0 0 8px 8px;">
<tr>
<td class="email-padding" style="padding:24px 32px;">
${note}
${support}
<p style="margin:12px 0 8px;font-family:${FONT_STACK};font-size:11px;line-height:16px;color:${brand.mutedColor};">
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
<td align="center" style="padding:24px 12px;">
<table role="presentation" class="email-container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
<tr>
<td>
${renderHeader(brand, options.headerSubtitle)}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${brand.surfaceColor};border-left:1px solid ${brand.borderColor};border-right:1px solid ${brand.borderColor};">
<tr>
<td class="email-padding" style="padding:32px;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:${brand.textColor};">
<h1 style="margin:0 0 20px;font-family:${FONT_STACK};font-size:22px;line-height:28px;font-weight:600;color:${brand.textColor};">${title}</h1>
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
  return [
    brandFooterLine(b),
    b.supportEmail ? `Support: ${b.supportEmail}` : "",
    b.appUrl ? b.appUrl : "",
  ]
    .filter(Boolean)
    .join("\n");
}
