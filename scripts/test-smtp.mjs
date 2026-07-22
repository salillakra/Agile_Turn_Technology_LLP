#!/usr/bin/env node
/**
 * One-shot SMTP verify (+ optional send) using nodemailer.
 *
 * Usage:
 *   SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 SMTP_USER=... SMTP_PASSWORD=... \
 *   SMTP_FROM='Name <you@domain>' node scripts/test-smtp.mjs
 *
 * Optional send:
 *   SMTP_TEST_TO=you@example.com node scripts/test-smtp.mjs --send
 */
import nodemailer from "nodemailer";

function req(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`missing env: ${name}`);
    process.exit(2);
  }
  return v;
}

const host = req("SMTP_HOST");
const port = Number(process.env.SMTP_PORT || "587");
const secure =
  process.env.SMTP_SECURE === "1" ||
  process.env.SMTP_SECURE === "true" ||
  port === 465;
const user = req("SMTP_USER");
const pass = req("SMTP_PASSWORD");
const from = process.env.SMTP_FROM?.trim() || user;
const doSend = process.argv.includes("--send");
const to = process.env.SMTP_TEST_TO?.trim() || user;

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
});

console.log(
  JSON.stringify(
    {
      step: "config",
      host,
      port,
      secure,
      user,
      from,
      passwordLen: pass.length,
      passwordPrefix: pass.slice(0, 4) + "…",
      doSend,
      to: doSend ? to : undefined,
    },
    null,
    2
  )
);

try {
  await transporter.verify();
  console.log(JSON.stringify({ step: "verify", ok: true }));
} catch (err) {
  console.error(
    JSON.stringify({
      step: "verify",
      ok: false,
      code: err?.code,
      responseCode: err?.responseCode,
      response: err?.response,
      message: err?.message,
    })
  );
  process.exit(1);
}

if (doSend) {
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: `[SMTP test] ${new Date().toISOString()}`,
      text: `SMTP relay test via ${host}:${port}\nSent at ${new Date().toISOString()}\n`,
    });
    console.log(
      JSON.stringify({
        step: "send",
        ok: true,
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        step: "send",
        ok: false,
        code: err?.code,
        responseCode: err?.responseCode,
        response: err?.response,
        message: err?.message,
      })
    );
    process.exit(1);
  }
}

await transporter.close();
