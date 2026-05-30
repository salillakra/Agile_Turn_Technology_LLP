import { renderBaseEmail } from "@/src/lib/email/templates/base-template";
import { getEmailBrand } from "@/src/lib/email/templates/brand";
import { emailButton, emailParagraph, plainTextBlock } from "@/src/lib/email/templates/components";
import { stringField } from "@/src/lib/email/templates/layout";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
import type { RenderedEmail } from "@/src/lib/email/templates/types";

export function renderPasswordResetEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const resetUrl = stringField(data, "resetUrl") || stringField(data, "url");

  const bodyHtml =
    emailParagraph("You requested a password reset for your recruitment account.") +
    (resetUrl
      ? emailButton({ href: resetUrl, label: "Reset password", brand })
      : emailParagraph("Use the link provided by your administrator.")) +
    emailParagraph("If you did not request this, you can ignore this email.");

  const html = renderBaseEmail({
    title: "Password reset",
    headerSubtitle: brand.productName,
    preheader: "Reset your password",
    bodyHtml,
    footerNote: "This link expires after a limited time for your security.",
  });

  const textBody = plainTextBlock([
    "Password reset requested.",
    resetUrl ? `Reset link: ${resetUrl}` : "Use the link provided by your administrator.",
    "If you did not request this, ignore this email.",
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
