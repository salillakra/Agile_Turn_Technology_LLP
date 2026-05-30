import { renderBaseEmail } from "@/src/lib/email/templates/base-template";
import { getEmailBrand } from "@/src/lib/email/templates/brand";
import {
  emailButton,
  emailDetailTable,
  emailParagraph,
  plainTextBlock,
} from "@/src/lib/email/templates/components";
import { stringField } from "@/src/lib/email/templates/layout";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
import type { RenderedEmail } from "@/src/lib/email/templates/types";

export function renderApplicationReceivedEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const candidateName = stringField(data, "candidateName") || "A candidate";
  const jobTitle = stringField(data, "jobTitle") || "a role";
  const source = stringField(data, "source");

  const bodyHtml =
    emailParagraph(`New application: ${candidateName} applied for ${jobTitle}.`) +
    emailDetailTable([
      { label: "Candidate", value: candidateName },
      { label: "Role", value: jobTitle },
      ...(source ? [{ label: "Source", value: source }] : []),
    ]) +
    emailButton({ href: brand.appUrl, label: "Sign in to review", brand });

  const html = renderBaseEmail({
    title: "New application",
    headerSubtitle: brand.productName,
    preheader: `${candidateName} — ${jobTitle}`,
    bodyHtml,
  });

  const textBody = plainTextBlock([
    `New application: ${candidateName} applied for ${jobTitle}.`,
    source ? `Source: ${source}` : "",
    `Sign in: ${brand.appUrl}`,
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
