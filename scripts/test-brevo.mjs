#!/usr/bin/env node
/**
 * One-shot Brevo transactional email test via @getbrevo/brevo SDK.
 * Docs: https://developers.brevo.com/guides/node-js
 *
 *   BREVO_API_KEY=xkeysib-... node scripts/test-brevo.mjs
 *   BREVO_API_KEY=... BREVO_TO=you@example.com node scripts/test-brevo.mjs
 */
import { BrevoClient, BrevoError } from "@getbrevo/brevo";

const apiKey = process.env.BREVO_API_KEY?.trim();
if (!apiKey) {
  console.error("missing env: BREVO_API_KEY");
  process.exit(2);
}

const toEmail =
  process.env.BREVO_TO?.trim() || "salillakra.dev@gmail.com";
const senderEmail =
  process.env.BREVO_FROM?.trim() || "salillakra.dev@gmail.com";
const senderName = process.env.BREVO_FROM_NAME?.trim() || "Agile Turn";

const brevo = new BrevoClient({ apiKey, timeoutInSeconds: 30, maxRetries: 1 });

console.log(
  JSON.stringify(
    {
      step: "config",
      sdk: "@getbrevo/brevo",
      apiKeyPrefix: apiKey.slice(0, 12) + "…",
      apiKeyLen: apiKey.length,
      sender: { name: senderName, email: senderEmail },
      to: toEmail,
    },
    null,
    2
  )
);

try {
  const result = await brevo.transactionalEmails.sendTransacEmail({
    subject: `[Brevo API test] ${new Date().toISOString()}`,
    htmlContent: `<html><body><p>Brevo SDK transactional email test.</p><p>Sent at ${new Date().toISOString()}</p></body></html>`,
    textContent: `Brevo SDK transactional email test.\nSent at ${new Date().toISOString()}\n`,
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: "Salil Lakra" }],
  });
  console.log(
    JSON.stringify({ step: "send", ok: true, messageId: result.messageId }, null, 2)
  );
} catch (err) {
  if (err instanceof BrevoError) {
    console.error(
      JSON.stringify({
        step: "send",
        ok: false,
        error: err.constructor.name,
        message: err.message,
        statusCode: err.statusCode,
        body: err.body,
      })
    );
  } else {
    console.error(
      JSON.stringify({
        step: "send",
        ok: false,
        error: err?.constructor?.name,
        message: err?.message ?? String(err),
      })
    );
  }
  process.exit(1);
}
