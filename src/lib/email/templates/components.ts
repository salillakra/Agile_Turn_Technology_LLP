import type { EmailBrand } from "@/src/lib/email/templates/brand";
import { escapeHtml } from "@/src/lib/email/templates/layout";

/** Email-safe stack — avoid Inter/Roboto defaults. */
export const EMAIL_FONT_STACK =
  "'Helvetica Neue',Helvetica,Arial,'Segoe UI',sans-serif";

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.6;color:inherit;">${escapeHtml(text)}</p>`;
}

export function emailHeading(text: string, level: 1 | 2 = 1): string {
  const size = level === 1 ? "22px" : "17px";
  const margin = level === 1 ? "0 0 8px" : "24px 0 8px";
  const tag = level === 1 ? "h1" : "h2";
  return `<${tag} style="margin:${margin};font-family:${EMAIL_FONT_STACK};font-size:${size};line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:inherit;">${escapeHtml(text)}</${tag}>`;
}

export function emailMuted(text: string): string {
  return `<p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};font-size:13px;line-height:1.55;color:#787774;">${escapeHtml(text)}</p>`;
}

export function emailButton(params: {
  href: string;
  label: string;
  brand: EmailBrand;
}): string {
  const href = escapeHtml(params.href);
  const label = escapeHtml(params.label);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px;">
<tr>
<td style="border-radius:6px;background:${params.brand.primaryColor};">
<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:600;letter-spacing:0.01em;color:#ffffff;text-decoration:none;border-radius:6px;">${label}</a>
</td>
</tr>
</table>`;
}

export type DetailRow = { label: string; value: string };

/** Key/value block for structured transactional content. */
export function emailDetailTable(rows: DetailRow[]): string {
  const cells = rows
    .filter((r) => r.value.length > 0)
    .map(
      (r) => `<tr>
<td style="padding:10px 16px 10px 0;font-family:${EMAIL_FONT_STACK};font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#787774;vertical-align:top;white-space:nowrap;border-bottom:1px solid #EAEAEA;">${escapeHtml(r.label)}</td>
<td style="padding:10px 0;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.5;color:inherit;vertical-align:top;border-bottom:1px solid #EAEAEA;">${escapeHtml(r.value)}</td>
</tr>`
    )
    .join("");

  if (!cells) return "";

  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
<tbody>
${cells}
</tbody>
</table>`;
}

export function emailDivider(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
<tr><td style="border-top:1px solid #EAEAEA;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>`;
}

export function plainTextBlock(lines: string[]): string {
  return lines.filter(Boolean).join("\n\n");
}

/** Numbered list for next steps and similar copy. */
export function emailOrderedList(items: string[]): string {
  const rows = items
    .filter((item) => item.length > 0)
    .map(
      (item) =>
        `<li style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.55;color:inherit;">${escapeHtml(item)}</li>`
    )
    .join("");
  if (!rows) return "";
  return `<ol style="margin:0 0 20px;padding-left:22px;">${rows}</ol>`;
}
