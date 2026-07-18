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
import { applicationStatusUrl } from "@/src/lib/application-deep-link";

function resolveStageLabel(
  data: Record<string, unknown>,
  primaryKey: "oldStage" | "newStage",
  fallbackKey: "fromStage" | "toStage"
): string {
  return stringField(data, primaryKey) || stringField(data, fallbackKey) || "—";
}

/**
 * Candidate-facing application stage update (`stage_update` / `candidate_stage_update`).
 *
 * Expected `data`: candidateName, jobTitle, oldStage, newStage, applicationId
 * (aliases: fromStage, toStage).
 */
export function renderCandidateStageUpdateEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const candidateName = stringField(data, "candidateName") || "there";
  const jobTitle = stringField(data, "jobTitle") || "the role";
  const oldStage = resolveStageLabel(data, "oldStage", "fromStage");
  const newStage = resolveStageLabel(data, "newStage", "toStage");
  const applicationId = stringField(data, "applicationId");
  const statusUrl = applicationId
    ? applicationStatusUrl(brand.appUrl, applicationId)
    : "";

  const bodyHtml =
    emailParagraph(`Hello ${candidateName},`) +
    emailParagraph(
      `We have an update on your application for ${jobTitle}.`
    ) +
    emailDetailTable([
      { label: "Role", value: jobTitle },
      { label: "Previous stage", value: oldStage },
      { label: "New stage", value: newStage },
    ]) +
    (statusUrl
      ? emailButton({ href: statusUrl, label: "View application status", brand })
      : "") +
    emailParagraph(
      "Our recruiting team will reach out if any action is needed from you."
    ) +
    emailParagraph("Thank you for your interest in joining our team.");

  const html = renderBaseEmail({
    title: "Application update",
    headerSubtitle: brand.productName,
    preheader: `${jobTitle}: ${oldStage} → ${newStage}`,
    bodyHtml,
    footerNote:
      "You are receiving this because you applied for a role with us. Reply to your recruiter if you have questions.",
  });

  const textBody = plainTextBlock([
    `Hello ${candidateName},`,
    `We have an update on your application for ${jobTitle}.`,
    `Previous stage: ${oldStage}`,
    `New stage: ${newStage}`,
    statusUrl ? `View application status: ${statusUrl}` : "",
    "Our recruiting team will reach out if any action is needed from you.",
    "Thank you for your interest in joining our team.",
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
