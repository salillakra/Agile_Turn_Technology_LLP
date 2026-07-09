import { renderBaseEmail } from "@/src/lib/email/templates/base-template";
import { getEmailBrand } from "@/src/lib/email/templates/brand";
import {
  emailButton,
  emailMuted,
  emailParagraph,
  plainTextBlock,
} from "@/src/lib/email/templates/components";
import { buildRenderedEmail } from "@/src/lib/email/templates/render-helpers";
import type { RenderedEmail } from "@/src/lib/email/templates/types";

function roleLabel(role: string): string {
  if (role === "HIRING_MANAGER") return "Hiring Manager";
  if (role === "RECRUITER") return "Recruiter";
  if (role === "ADMIN") return "Admin";
  return role;
}

/**
 * Renders the invite email sent to a new team member.
 *
 * Expected `data` shape:
 * - inviterName: string
 * - role: string (ADMIN | RECRUITER | HIRING_MANAGER)
 * - inviteUrl: string (full URL to /invite/[token])
 * - expiresInDays: number
 */
export function renderUserInviteEmail(
  data: Record<string, unknown>,
  subject: string
): RenderedEmail {
  const brand = getEmailBrand();
  const inviterName = String(data.inviterName || "An administrator");
  const role = roleLabel(String(data.role || "RECRUITER"));
  const inviteUrl = String(data.inviteUrl || "");
  const expiresInDays = Number(data.expiresInDays || 7);

  const bodyHtml = [
    emailParagraph(
      `${inviterName} has invited you to join ${brand.productName} as a ${role}.`
    ),
    emailParagraph(
      "Click the button below to set up your account and get started."
    ),
    emailButton({ href: inviteUrl, label: "Accept Invite & Create Account", brand }),
    emailMuted(
      `This invitation link expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}. If you did not expect this invite, you can safely ignore this email.`
    ),
  ].join("");

  const html = renderBaseEmail({
    title: subject,
    preheader: `${inviterName} invited you to join ${brand.productName}`,
    headerSubtitle: "Team Invitation",
    bodyHtml,
  });

  const text = plainTextBlock([
    `${inviterName} has invited you to join ${brand.productName} as a ${role}.`,
    `Accept your invite: ${inviteUrl}`,
    `This link expires in ${expiresInDays} days.`,
  ]);

  return buildRenderedEmail({ subject, html, textBody: text });
}
