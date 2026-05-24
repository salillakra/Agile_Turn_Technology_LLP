import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

const SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  image: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      phone: true,
      personalEmail: true,
      jobTitle: true,
      department: true,
      location: true,
      bio: true,
      timezone: true,
      avatarFileName: true,
      preferences: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

export type ProfileApiUser = Prisma.UserGetPayload<{ select: typeof SELECT }>;

export async function ensureUserProfileRow(userId: string): Promise<void> {
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

function isLooseValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** 0–100 — name, sign-in email, phone, photo, personal email (all roles). */
export function computeProfileCompleteness(user: ProfileApiUser): number {
  const p = user.profile;
  if (!p) return 0;

  const pe = (p as { personalEmail?: string | null }).personalEmail?.trim();
  const personal = [
    user.name?.trim(),
    user.email?.trim(),
    p.phone?.trim(),
    (user.image?.trim() || p.avatarFileName) != null && (user.image?.trim() || p.avatarFileName) !== "",
    pe,
  ].filter(Boolean).length;

  return Math.round(Math.min(100, (personal / 5) * 100));
}

export async function loadProfileForUser(userId: string): Promise<ProfileApiUser | null> {
  await ensureUserProfileRow(userId);
  return prisma.user.findUnique({
    where: { id: userId },
    select: SELECT,
  });
}

const LIMITS = {
  name: 120,
  image: 2048,
  phone: 40,
  personalEmail: 254,
  jobTitle: 120,
  department: 80,
  location: 120,
  bio: 2000,
  timezone: 80,
} as const;

export type ProfileUpdateBody = Record<string, unknown>;

export class ProfileValidationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

export function parseAndValidateProfileUpdate(
  body: Record<string, unknown>,
  role: Role
): {
  user: { name?: string; image?: string | null };
  profile: Prisma.UserProfileUpdateInput;
} {
  const isAdmin = role === "ADMIN";

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const image = body.image === null ? null : typeof body.image === "string" ? body.image.trim() || null : undefined;
  const phone = body.phone === null ? null : typeof body.phone === "string" ? body.phone.trim() || null : undefined;
  const personalEmail =
    body.personalEmail === null
      ? null
      : typeof body.personalEmail === "string"
        ? body.personalEmail.trim() || null
        : undefined;
  const jobTitle =
    body.jobTitle === null ? null : typeof body.jobTitle === "string" ? body.jobTitle.trim() || null : undefined;
  const department =
    body.department === null ? null : typeof body.department === "string" ? body.department.trim() || null : undefined;
  const location =
    body.location === null ? null : typeof body.location === "string" ? body.location.trim() || null : undefined;
  const bio = body.bio === null ? null : typeof body.bio === "string" ? body.bio.trim() || null : undefined;
  const timezone =
    body.timezone === null ? null : typeof body.timezone === "string" ? body.timezone.trim() || null : undefined;

  let preferences: Prisma.InputJsonValue | undefined | null = undefined;

  if (body.preferences === null) preferences = null;
  else if (body.preferences !== undefined) {
    if (typeof body.preferences !== "object" || body.preferences === null || Array.isArray(body.preferences)) {
      throw new ProfileValidationError("VALIDATION_ERROR", "preferences must be a JSON object or null");
    }
    preferences = body.preferences as Prisma.InputJsonValue;
  }

  if (!isAdmin) {
    const removedFromProfile = [
      "companyName",
      "experience",
      "education",
      "linkedInUrl",
      "githubUrl",
      "portfolioUrl",
      "skills",
    ] as const;
    for (const key of removedFromProfile) {
      if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
        throw new ProfileValidationError(
          "FORBIDDEN",
          `Field "${key}" is not supported on the profile API for your role.`,
          403
        );
      }
    }
  }

  if (name !== undefined) {
    if (!name) throw new ProfileValidationError("VALIDATION_ERROR", "name cannot be empty");
    if (name.length > LIMITS.name) throw new ProfileValidationError("VALIDATION_ERROR", `name must be at most ${LIMITS.name} characters`);
  }
  if (image !== undefined && image != null && image.length > LIMITS.image) {
    throw new ProfileValidationError("VALIDATION_ERROR", `image URL must be at most ${LIMITS.image} characters`);
  }
  if (personalEmail != null && personalEmail.length > 0 && !isLooseValidEmail(personalEmail)) {
    throw new ProfileValidationError("VALIDATION_ERROR", "personalEmail must be a valid email address");
  }

  const checkLen = (v: string | null | undefined, label: string, max: number) => {
    if (v != null && v.length > max) throw new ProfileValidationError("VALIDATION_ERROR", `${label} must be at most ${max} characters`);
  };
  checkLen(phone, "phone", LIMITS.phone);
  checkLen(personalEmail ?? null, "personalEmail", LIMITS.personalEmail);
  checkLen(jobTitle, "jobTitle", LIMITS.jobTitle);
  checkLen(department, "department", LIMITS.department);
  checkLen(location, "location", LIMITS.location);
  checkLen(bio, "bio", LIMITS.bio);
  checkLen(timezone, "timezone", LIMITS.timezone);

  if (!isAdmin) {
    if (
      jobTitle !== undefined ||
      department !== undefined ||
      location !== undefined
    ) {
      throw new ProfileValidationError(
        "FORBIDDEN",
        "Only administrators may update job title, department, or location from the profile API.",
        403
      );
    }
  }

  const userOut: { name?: string; image?: string | null } = {};
  if (name !== undefined) userOut.name = name;
  if (image !== undefined) userOut.image = image;

  const profileOut: Prisma.UserProfileUpdateInput = {};
  if (phone !== undefined) profileOut.phone = phone;
  if (personalEmail !== undefined) profileOut.personalEmail = personalEmail;
  if (isAdmin) {
    if (jobTitle !== undefined) profileOut.jobTitle = jobTitle;
    if (department !== undefined) profileOut.department = department;
    if (location !== undefined) profileOut.location = location;
  }
  if (bio !== undefined) profileOut.bio = bio;
  if (timezone !== undefined) profileOut.timezone = timezone;
  if (preferences !== undefined) profileOut.preferences = preferences;

  return { user: userOut, profile: profileOut };
}

export async function applyProfileUpdate(userId: string, role: Role, body: Record<string, unknown>): Promise<ProfileApiUser> {
  const { user, profile } = parseAndValidateProfileUpdate(body, role);
  await ensureUserProfileRow(userId);

  await prisma.$transaction(async (tx) => {
    if (Object.keys(user).length > 0) {
      await tx.user.update({ where: { id: userId }, data: user });
    }
    if (Object.keys(profile).length > 0) {
      await tx.userProfile.update({ where: { userId }, data: profile });
    }
  });

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: SELECT,
  });
  if (!updated) throw new ProfileValidationError("NOT_FOUND", "User not found", 404);
  return updated;
}

export function profileWithCompleteness(user: ProfileApiUser) {
  return {
    ...user,
    profileCompleteness: computeProfileCompleteness(user),
  };
}
