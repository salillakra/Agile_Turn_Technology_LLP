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

/**
 * Pipeline stage update — internal stakeholders (template key: `stage_changed` / `stage_update`).
 */
export function renderStageChangedEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const candidateName = stringField(data, "candidateName") || "Candidate";
  const jobTitle = stringField(data, "jobTitle") || "the role";
  const fromStage =
    stringField(data, "fromStage") || stringField(data, "oldStage") || "—";
  const toStage =
    stringField(data, "toStage") || stringField(data, "newStage") || "—";
  const appUrl =
    stringField(data, "appUrl") ||
    (stringField(data, "applicationId")
      ? `${brand.appUrl}/applications/${stringField(data, "applicationId")}`
      : "");

  const bodyHtml =
    emailParagraph(
      `${candidateName} moved from ${fromStage} to ${toStage} for ${jobTitle}.`
    ) +
    emailDetailTable([
      { label: "Candidate", value: candidateName },
      { label: "Role", value: jobTitle },
      { label: "Previous stage", value: fromStage },
      { label: "New stage", value: toStage },
    ]) +
    (appUrl ? emailButton({ href: appUrl, label: "View application", brand }) : "");

  const html = renderBaseEmail({
    title: "Pipeline stage update",
    headerSubtitle: brand.productName,
    preheader: `${candidateName}: ${fromStage} → ${toStage}`,
    bodyHtml,
    footerNote: "You received this because you are subscribed to pipeline updates for this job.",
  });

  const textBody = plainTextBlock([
    "Pipeline stage update",
    `${candidateName} moved from ${fromStage} to ${toStage} for ${jobTitle}.`,
    appUrl ? `View application: ${appUrl}` : "",
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}

