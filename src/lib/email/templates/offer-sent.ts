import { renderBaseEmail } from "@/src/lib/email/templates/base-template";
import { getEmailBrand } from "@/src/lib/email/templates/brand";
import {
  emailButton,
  emailDetailTable,
  emailHeading,
  emailOrderedList,
  emailParagraph,
  plainTextBlock,
} from "@/src/lib/email/templates/components";
import {
  resolveOfferDetailsSummary,
  resolveOfferNextSteps,
} from "@/src/lib/email/templates/offer-sent-fields";
import { stringField } from "@/src/lib/email/templates/layout";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
import type { RenderedEmail } from "@/src/lib/email/templates/types";
import { applicationStatusUrl } from "@/src/lib/application-deep-link";

/**
 * Offer sent — candidate notification (`offer_sent`).
 *
 * Expected `data`: candidateName, jobTitle, offerDetailsSummary (optional),
 * nextSteps (string or string[]), startDate, compensation, applicationId.
 */
export function renderOfferSentEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const candidateName = stringField(data, "candidateName") || "there";
  const jobTitle = stringField(data, "jobTitle") || "the position";
  const offerSummary = resolveOfferDetailsSummary(data);
  const nextSteps = resolveOfferNextSteps(data);
  const startDate =
    stringField(data, "startDate") || stringField(data, "proposedStartDate");
  const compensation =
    stringField(data, "compensation") || stringField(data, "salary");
  const recruiterContact =
    stringField(data, "recruiterContact") || stringField(data, "contactEmail");
  const applicationId = stringField(data, "applicationId");
  const statusUrl = applicationId
    ? applicationStatusUrl(brand.appUrl, applicationId)
    : "";

  const bodyHtml =
    emailParagraph(`Hello ${candidateName},`) +
    emailParagraph(
      `Congratulations — we are pleased to share an offer for the ${jobTitle} position.`
    ) +
    emailDetailTable([
      { label: "Candidate", value: candidateName },
      { label: "Position", value: jobTitle },
      ...(compensation ? [{ label: "Compensation", value: compensation }] : []),
      ...(startDate ? [{ label: "Proposed start", value: startDate }] : []),
    ]) +
    emailHeading("Offer summary", 2) +
    emailParagraph(offerSummary) +
    emailHeading("Next steps", 2) +
    emailOrderedList(nextSteps) +
    (statusUrl
      ? emailButton({ href: statusUrl, label: "View application status", brand })
      : "") +
    (recruiterContact
      ? emailParagraph(`Questions? Contact ${recruiterContact}.`)
      : emailParagraph("Your recruiting team will follow up with the formal offer letter.")) +
    emailParagraph("We look forward to welcoming you to the team.");

  const html = renderBaseEmail({
    title: "Offer letter",
    headerSubtitle: brand.productName,
    preheader: `Offer for ${jobTitle}`,
    bodyHtml,
    footerNote:
      "This message is confidential. Please do not forward offer details without approval from your recruiting contact.",
  });

  const textBody = plainTextBlock([
    `Hello ${candidateName},`,
    `Congratulations — we are pleased to share an offer for the ${jobTitle} position.`,
    compensation ? `Compensation: ${compensation}` : "",
    startDate ? `Proposed start: ${startDate}` : "",
    `Offer summary:\n${offerSummary}`,
    `Next steps:\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    statusUrl ? `View application status: ${statusUrl}` : "",
    recruiterContact
      ? `Questions? Contact ${recruiterContact}.`
      : "Your recruiting team will follow up with the formal offer letter.",
    "We look forward to welcoming you to the team.",
  ]);

  return buildRenderedEmail({ subject, html, textBody });
}
