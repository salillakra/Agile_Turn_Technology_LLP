# SMTP Server Requirements

Request for SMTP (outbound mail) credentials and DNS setup so **Agile Turn Recruitment Suite** can send transactional email via Nodemailer + the BullMQ `ats-email` worker.

Fill in the **Provider response** sections below and return this document (or equivalent secrets via your secrets manager — do not put passwords in git or chat).

---

## 1. Why we need SMTP

The application sends **transactional** mail only (not bulk marketing campaigns). Examples:

| Category | Examples |
| --- | --- |
| Auth / access | Password reset, user invite |
| Hiring workflow | Application received, stage updates, offer sent |
| Interviews | Scheduled, rescheduled, cancelled, panel notice, reminders (candidate + interviewer) |

Without a working SMTP relay (and `EMAIL_SEND_ENABLED=1` on workers), queued jobs are skipped or fail; local/dev may use a sink such as Mailpit instead of a real provider.

---

## 2. What we need from the SMTP server / provider

### 2.1 Connection (required for the app)

| Item | App env var | Notes | Provider response |
| --- | --- | --- | --- |
| SMTP hostname | `SMTP_HOST` | e.g. `smtp.resend.com`, `email-smtp.<region>.amazonaws.com` | |
| Port | `SMTP_PORT` | App default **587** if unset. Common: **587** (STARTTLS) or **465** (TLS) | |
| TLS / secure | `SMTP_SECURE` | `true` for port 465; typically `false` for 587. If unset, app treats **465 as secure** | |
| Auth username | `SMTP_USER` | Optional only if the relay allows unauthenticated send (rare in production). If set, password is required | |
| Auth password / API key | `SMTP_PASSWORD` | Store in secrets manager only. Never commit | |
| From address | `SMTP_FROM` | e.g. `Agile Turn <noreply@yourdomain.com>`. Must be allowed by the provider | |
| Sending domain | `EMAIL_SENDING_DOMAIN` | Domain part of `SMTP_FROM` (e.g. `yourdomain.com`) | |

**App validation (exact):** `SMTP_HOST` and `SMTP_FROM` are required. If `SMTP_USER` is set, `SMTP_PASSWORD` is required. Source: `src/lib/email/smtp-env.ts`.

### 2.2 Network / access

| Requirement | Detail | Provider response |
| --- | --- | --- |
| Egress allowlist | Worker and API processes that send mail must reach `SMTP_HOST:SMTP_PORT` (outbound TCP) | Allowed from: ___ |
| IP allowlisting | If the provider restricts by IP, list our production egress IPs | Needed? Y/N — IPs: ___ |
| Environments | Separate credentials for **dev / staging / production** preferred | |

### 2.3 Protocol capabilities

| Requirement | Detail |
| --- | --- |
| SMTP AUTH | LOGIN/PLAIN (Nodemailer standard) when credentials are required |
| Encryption | STARTTLS (587) or implicit TLS (465) |
| Message format | HTML + plain-text multipart (templates render both) |
| Envelope From | Must accept our configured `SMTP_FROM` (or provider-mandated verified sender) |

### 2.4 Volume & rate (baseline we pace to)

Default app-side caps (tunable via env):

| Cap | Default | Meaning |
| --- | --- | --- |
| Global sends | **25 / 60s** | Across workers (`EMAIL_OUTBOUND_GLOBAL_MAX`) |
| Per recipient | **5 / hour** | Anti-spam guard |
| Worker concurrency | **3** | Parallel SMTP workers |

**Ask provider:** confirmed plan limits (messages/day, messages/second), and whether 25/min sustained is within quota. If not, state the hard limit so we can lower our caps.

| Question | Provider response |
| --- | --- |
| Daily / monthly send quota | |
| Burst / per-second limit | |
| Concurrent SMTP connections allowed | |

### 2.5 Deliverability (DNS — required for production)

Configure at the **DNS host for the domain in `SMTP_FROM`**, not in application env. Provider should supply exact record values.

| Record | Typical host | Purpose | Provider-supplied value |
| --- | --- | --- | --- |
| **SPF** | `@` (TXT) | Authorize this SMTP service to send for the domain | |
| **DKIM** | `selector._domainkey` (TXT/CNAME) | Sign messages | |
| **DMARC** | `_dmarc` (TXT) | Policy + reporting; start with `p=none` | |

Also confirm:

| Question | Provider response |
| --- | --- |
| Domain verification steps completed? | |
| Verified From addresses / domains | |
| Bounce / complaint webhook or mailbox (if any) | |

Guidance in-repo: `src/lib/email/email-security.ts`, comments in `.env.example`.

---

## 3. Example provider profiles (reference only)

These are examples already documented for this codebase — pick one real provider and fill Section 2 with live values.

**Resend SMTP**

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=<api_key>
SMTP_FROM="Agile Turn <onboarding@resend.dev>"   # or verified domain
EMAIL_SENDING_DOMAIN=resend.dev   # or your domain
EMAIL_SEND_ENABLED=1
```

**Local sink (Mailpit) — not for production**

```
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM="Recruitment Suite <noreply@example.com>"
```

---

## 4. What we will configure on our side (after you reply)

1. Set secrets in the environment / secrets manager (never in git).
2. Set `EMAIL_SEND_ENABLED=1` on processes that run the email worker.
3. Ensure Redis + BullMQ email worker are running (`ats-email` queue).
4. Optionally call `verifySmtpConnection()` to confirm AUTH + connect without sending product mail.
5. Publish SPF / DKIM / DMARC using values from Section 2.5.
6. Align `EMAIL_SENDING_DOMAIN` with the domain in `SMTP_FROM`.

---

## 5. Security constraints (please acknowledge)

- Do **not** email `SMTP_PASSWORD` in cleartext long-term; use a secrets vault or one-time secure channel.
- Production must **not** use `localhost` / `127.0.0.1` as `SMTP_HOST`.
- Credentials must be scoped to this application’s senders only where the provider supports it.
- We will rotate credentials if they are ever exposed.

| Acknowledgement | Sign-off |
| --- | --- |
| Secrets delivered via approved channel | |
| Separate env credentials provided (or N/A) | |
| DNS auth records provided or scheduled | |

---

## 6. Contact / return

| Field | Value |
| --- | --- |
| Requested by | |
| Date | |
| Target go-live | |
| Provider / IT contact | |
| Completed response returned to | |

---

## Appendix — code references

| Concern | Location |
| --- | --- |
| SMTP env parse / validation | `src/lib/email/smtp-env.ts` |
| Nodemailer transporter | `src/lib/email/transporter.ts` |
| Send path | `src/lib/email/send-email.ts` |
| Worker gate (`EMAIL_SEND_ENABLED`, SMTP check) | `src/lib/queues/workers/process-email-job.ts` |
| Outbound rate limits | `src/lib/queues/email-outbound-rate-limit.ts` |
| SPF / DKIM / DMARC practices | `src/lib/email/email-security.ts` |
| Env examples | `.env.example` (SMTP section) |
