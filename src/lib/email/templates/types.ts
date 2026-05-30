/** Output of a template renderer passed to nodemailer. */
export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type EmailTemplateRenderer = (
  data: Record<string, unknown>,
  subject: string
) => RenderedEmail;
