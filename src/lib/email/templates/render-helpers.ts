import { baseEmailFooterText } from "@/src/lib/email/templates/base-template";
import { getEmailBrand } from "@/src/lib/email/templates/brand";
import type { RenderedEmail } from "@/src/lib/email/templates/types";

/** Assemble subject + HTML + plain text with a consistent text footer. */
export function buildRenderedEmail(params: {
  subject: string;
  html: string;
  textBody: string;
}): RenderedEmail {
  const footer = baseEmailFooterText(getEmailBrand());
  return {
    subject: params.subject,
    html: params.html,
    text: `${params.textBody}\n\n---\n${footer}`,
  };
}
