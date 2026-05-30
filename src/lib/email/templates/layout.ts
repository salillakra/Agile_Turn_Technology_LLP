import { renderBaseEmail } from "@/src/lib/email/templates/base-template";

/**
 * HTML escaping and field helpers shared by template renderers.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function stringField(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * @deprecated Prefer {@link renderBaseEmail} via template-specific renderers.
 * Kept for backward compatibility; wraps content in the branded base layout.
 */
export function wrapHtmlEmail(params: {
  title: string;
  bodyHtml: string;
  previewText?: string;
}): string {
  return renderBaseEmail({
    title: params.title,
    bodyHtml: params.bodyHtml,
    preheader: params.previewText,
  });
}

/** @deprecated Use {@link emailParagraph} from `components.ts`. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}
