import type { EmailPreference } from "@prisma/client";
import {
  DEFAULT_EMAIL_PREFERENCE_CHANNELS,
  isChannelEnabled,
  resolveEmailPreferenceCategory,
  type EmailPreferenceCategory,
  type EmailPreferenceChannel,
} from "@/src/lib/email/email-preference-categories";
import type { EmailTemplateKey } from "@/src/lib/queues/email-queue";
import { prisma } from "@/src/lib/prisma";

export type EmailPreferenceDto = EmailPreferenceChannel & {
  email: string;
  userId: string | null;
  candidateId: string | null;
  updatedAt: Date;
};

export type CanSendEmailResult =
  | { allowed: true; category: EmailPreferenceCategory | null }
  | { allowed: false; category: EmailPreferenceCategory; reason: "preference_opt_out" };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function channelsFromRow(row: EmailPreference): EmailPreferenceChannel {
  return {
    stageUpdates: row.stageUpdates,
    interviewReminders: row.interviewReminders,
    marketingEmails: row.marketingEmails,
  };
}

export function toEmailPreferenceDto(row: EmailPreference): EmailPreferenceDto {
  return {
    email: row.email,
    userId: row.userId,
    candidateId: row.candidateId,
    ...channelsFromRow(row),
    updatedAt: row.updatedAt,
  };
}

/**
 * Effective preferences for an inbox (DB row or product defaults).
 */
export async function getEmailPreferencesByEmail(
  email: string
): Promise<EmailPreferenceDto> {
  const normalized = normalizeEmail(email);
  const row = await prisma.emailPreference.findUnique({
    where: { email: normalized },
  });

  if (!row) {
    return {
      email: normalized,
      userId: null,
      candidateId: null,
      ...DEFAULT_EMAIL_PREFERENCE_CHANNELS,
      updatedAt: new Date(0),
    };
  }

  return toEmailPreferenceDto(row);
}

export async function getEmailPreferencesForUser(
  userId: string
): Promise<EmailPreferenceDto | null> {
  const row = await prisma.emailPreference.findUnique({
    where: { userId },
  });
  return row ? toEmailPreferenceDto(row) : null;
}

export async function getEmailPreferencesForCandidate(
  candidateId: string
): Promise<EmailPreferenceDto | null> {
  const row = await prisma.emailPreference.findUnique({
    where: { candidateId },
  });
  return row ? toEmailPreferenceDto(row) : null;
}

/**
 * Whether an outbound template may be queued for this recipient.
 */
export async function canSendEmailToRecipient(params: {
  recipient: string;
  template: EmailTemplateKey | string;
}): Promise<CanSendEmailResult> {
  const category = resolveEmailPreferenceCategory(params.template);

  if (category == null) {
    return { allowed: true, category: null };
  }

  const prefs = await getEmailPreferencesByEmail(params.recipient);
  const enabled = isChannelEnabled(prefs, category);

  if (!enabled) {
    return { allowed: false, category, reason: "preference_opt_out" };
  }

  return { allowed: true, category };
}

export type UpsertEmailPreferenceInput = {
  email: string;
  userId?: string | null;
  candidateId?: string | null;
} & Partial<EmailPreferenceChannel>;

/**
 * Create or update preferences (future settings API / unsubscribe links).
 */
export async function upsertEmailPreferences(
  input: UpsertEmailPreferenceInput
): Promise<EmailPreferenceDto> {
  const email = normalizeEmail(input.email);
  const data = {
    email,
    userId: input.userId ?? null,
    candidateId: input.candidateId ?? null,
    stageUpdates:
      input.stageUpdates ?? DEFAULT_EMAIL_PREFERENCE_CHANNELS.stageUpdates,
    interviewReminders:
      input.interviewReminders ??
      DEFAULT_EMAIL_PREFERENCE_CHANNELS.interviewReminders,
    marketingEmails:
      input.marketingEmails ?? DEFAULT_EMAIL_PREFERENCE_CHANNELS.marketingEmails,
  };

  const row = await prisma.emailPreference.upsert({
    where: { email },
    create: data,
    update: {
      userId: data.userId,
      candidateId: data.candidateId,
      stageUpdates: data.stageUpdates,
      interviewReminders: data.interviewReminders,
      marketingEmails: data.marketingEmails,
    },
  });

  return toEmailPreferenceDto(row);
}

/** Link an existing preference row (by email) to a `User` after registration. */
export async function linkEmailPreferenceToUser(
  email: string,
  userId: string
): Promise<void> {
  const normalized = normalizeEmail(email);
  await prisma.emailPreference.updateMany({
    where: { email: normalized },
    data: { userId },
  });
}

/** Link preferences to `Candidate` when known (e.g. after apply). */
export async function linkEmailPreferenceToCandidate(
  email: string,
  candidateId: string
): Promise<void> {
  const normalized = normalizeEmail(email);
  await prisma.emailPreference.updateMany({
    where: { email: normalized },
    data: { candidateId },
  });
}
