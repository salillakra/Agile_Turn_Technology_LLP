/**
 * Shared validation for POST /api/interviews and PATCH /api/interviews/[id]/reschedule.
 */

export const INTERVIEW_SCHEDULE_MIN_DURATION_MINUTES = 5;
export const INTERVIEW_SCHEDULE_MAX_DURATION_MINUTES = 8 * 60;
export const INTERVIEW_MEETING_LINK_MAX_LENGTH = 2_000;

/** Default minimum lead time before interview start (minutes). */
export const DEFAULT_INTERVIEW_SCHEDULE_MIN_LEAD_MINUTES = 15;

/** Default maximum days in the future an interview may be scheduled. */
export const DEFAULT_INTERVIEW_SCHEDULE_MAX_HORIZON_DAYS = 365;

const BLOCKED_MEETING_LINK_PROTOCOLS = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "blob:",
]);

export type InterviewScheduleValidationError = {
  code: string;
  message: string;
  status: 400;
  details?: Record<string, unknown>;
};

export type ValidatedInterviewScheduleFields = {
  scheduledAt: Date;
  durationMinutes: number;
  meetingLink: string | null;
};

function parsePositiveIntEnv(raw: string | undefined, fallback: number, min = 1): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

export function getInterviewScheduleMinLeadMs(nowMs = Date.now()): number {
  const minutes = parsePositiveIntEnv(
    process.env.INTERVIEW_SCHEDULE_MIN_LEAD_MINUTES,
    DEFAULT_INTERVIEW_SCHEDULE_MIN_LEAD_MINUTES
  );
  return minutes * 60_000;
}

export function getInterviewScheduleMaxHorizonMs(nowMs = Date.now()): number {
  const days = parsePositiveIntEnv(
    process.env.INTERVIEW_SCHEDULE_MAX_HORIZON_DAYS,
    DEFAULT_INTERVIEW_SCHEDULE_MAX_HORIZON_DAYS
  );
  return nowMs + days * 24 * 60 * 60_000;
}

export function parseInterviewScheduledAt(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function validateInterviewDuration(
  value: unknown
): number | InterviewScheduleValidationError {
  const durationMinutes = Number(value);
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < INTERVIEW_SCHEDULE_MIN_DURATION_MINUTES ||
    durationMinutes > INTERVIEW_SCHEDULE_MAX_DURATION_MINUTES
  ) {
    return {
      code: "VALIDATION_ERROR",
      message: `durationMinutes must be an integer between ${INTERVIEW_SCHEDULE_MIN_DURATION_MINUTES} and ${INTERVIEW_SCHEDULE_MAX_DURATION_MINUTES}`,
      status: 400,
      details: {
        min: INTERVIEW_SCHEDULE_MIN_DURATION_MINUTES,
        max: INTERVIEW_SCHEDULE_MAX_DURATION_MINUTES,
      },
    };
  }
  return durationMinutes;
}

function requireHttpsMeetingLinks(): boolean {
  const raw = process.env.INTERVIEW_MEETING_LINK_REQUIRE_HTTPS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Reject loopback, link-local, and RFC1918 hosts (phishing / SSRF-style links in candidate emails). */
export function validateInterviewMeetingLinkHostname(
  hostname: string
): InterviewScheduleValidationError | null {
  const host = hostname.trim().toLowerCase();
  if (!host) {
    return {
      code: "INVALID_MEETING_LINK",
      message: "meetingLink must include a hostname",
      status: 400,
    };
  }

  if (host === "localhost" || host.endsWith(".localhost")) {
    return {
      code: "INVALID_MEETING_LINK",
      message: "meetingLink hostname is not allowed",
      status: 400,
      details: { hostname: host },
    };
  }

  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (bare === "::1" || bare === "0:0:0:0:0:0:0:1") {
    return {
      code: "INVALID_MEETING_LINK",
      message: "meetingLink hostname is not allowed",
      status: 400,
      details: { hostname: host },
    };
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map((s) => Number.parseInt(s!, 10));
    if (octets.some((n) => n > 255)) {
      return {
        code: "INVALID_MEETING_LINK",
        message: "meetingLink hostname is not a valid IPv4 address",
        status: 400,
      };
    }
    const [a, b] = octets;
    const blocked =
      a === 0 ||
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254);
    if (blocked) {
      return {
        code: "INVALID_MEETING_LINK",
        message: "meetingLink hostname is not allowed",
        status: 400,
        details: { hostname: host },
      };
    }
  }

  return null;
}

/**
 * Validates optional meeting links: http(s) only, no dangerous schemes, length cap.
 * Empty string clears the link (null).
 */
export function validateInterviewMeetingLink(
  value: unknown
): string | null | InterviewScheduleValidationError {
  if (value == null) return null;
  if (typeof value !== "string") {
    return {
      code: "VALIDATION_ERROR",
      message: "meetingLink must be a string when provided",
      status: 400,
    };
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.length > INTERVIEW_MEETING_LINK_MAX_LENGTH) {
    return {
      code: "VALIDATION_ERROR",
      message: `meetingLink exceeds maximum length (${INTERVIEW_MEETING_LINK_MAX_LENGTH})`,
      status: 400,
    };
  }

  const lower = trimmed.toLowerCase();
  for (const blocked of BLOCKED_MEETING_LINK_PROTOCOLS) {
    if (lower.startsWith(blocked)) {
      return {
        code: "INVALID_MEETING_LINK",
        message: "meetingLink uses a disallowed URL scheme",
        status: 400,
        details: { scheme: blocked.replace(":", "") },
      };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      code: "INVALID_MEETING_LINK",
      message: "meetingLink must be a valid absolute URL",
      status: 400,
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      code: "INVALID_MEETING_LINK",
      message: "meetingLink must use http or https",
      status: 400,
      details: { protocol: parsed.protocol },
    };
  }

  if (!parsed.hostname) {
    return {
      code: "INVALID_MEETING_LINK",
      message: "meetingLink must include a hostname",
      status: 400,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      code: "INVALID_MEETING_LINK",
      message: "meetingLink must not include embedded credentials",
      status: 400,
    };
  }

  const hostError = validateInterviewMeetingLinkHostname(parsed.hostname);
  if (hostError) {
    return hostError;
  }

  if (requireHttpsMeetingLinks() && parsed.protocol !== "https:") {
    return {
      code: "INVALID_MEETING_LINK",
      message: "meetingLink must use https",
      status: 400,
    };
  }

  return trimmed;
}

/**
 * Resolves meeting link for PATCH: omit field → keep existing; string → validate.
 */
export function resolveInterviewMeetingLinkForPatch(
  bodyValue: unknown,
  existing: string | null | undefined,
  hasMeetingLinkKey: boolean
): string | null | InterviewScheduleValidationError {
  if (!hasMeetingLinkKey) {
    return existing ?? null;
  }
  return validateInterviewMeetingLink(bodyValue);
}

export function validateInterviewScheduledAtWindow(
  scheduledAt: Date,
  nowMs = Date.now()
): InterviewScheduleValidationError | null {
  const minStartMs = nowMs + getInterviewScheduleMinLeadMs(nowMs);
  if (scheduledAt.getTime() < minStartMs) {
    const leadMinutes = parsePositiveIntEnv(
      process.env.INTERVIEW_SCHEDULE_MIN_LEAD_MINUTES,
      DEFAULT_INTERVIEW_SCHEDULE_MIN_LEAD_MINUTES
    );
    return {
      code: "SCHEDULE_IN_PAST",
      message: `scheduledAt must be at least ${leadMinutes} minute(s) in the future`,
      status: 400,
      details: {
        minScheduledAt: new Date(minStartMs).toISOString(),
        providedScheduledAt: scheduledAt.toISOString(),
      },
    };
  }

  const maxHorizonMs = getInterviewScheduleMaxHorizonMs(nowMs);
  if (scheduledAt.getTime() > maxHorizonMs) {
    const maxDays = parsePositiveIntEnv(
      process.env.INTERVIEW_SCHEDULE_MAX_HORIZON_DAYS,
      DEFAULT_INTERVIEW_SCHEDULE_MAX_HORIZON_DAYS
    );
    return {
      code: "SCHEDULE_TOO_FAR",
      message: `scheduledAt must be within ${maxDays} day(s) from now`,
      status: 400,
      details: {
        maxScheduledAt: new Date(maxHorizonMs).toISOString(),
        providedScheduledAt: scheduledAt.toISOString(),
      },
    };
  }

  return null;
}

export function validateInterviewerPanelSize(
  count: number
): InterviewScheduleValidationError | null {
  const max = parsePositiveIntEnv(
    process.env.INTERVIEW_SCHEDULE_MAX_INTERVIEWERS,
    15
  );
  if (count > max) {
    return {
      code: "VALIDATION_ERROR",
      message: `At most ${max} interviewer(s) may be assigned per interview`,
      status: 400,
      details: { maxInterviewers: max, provided: count },
    };
  }
  return null;
}

export function validateInterviewScheduleInput(params: {
  scheduledAt: unknown;
  durationMinutes: unknown;
  meetingLink?: unknown;
  nowMs?: number;
}):
  | { ok: true; value: ValidatedInterviewScheduleFields }
  | { ok: false; error: InterviewScheduleValidationError } {
  const scheduledAt = parseInterviewScheduledAt(params.scheduledAt);
  if (!scheduledAt) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "scheduledAt must be a valid ISO date string",
        status: 400,
      },
    };
  }

  const windowError = validateInterviewScheduledAtWindow(
    scheduledAt,
    params.nowMs
  );
  if (windowError) {
    return { ok: false, error: windowError };
  }

  const durationResult = validateInterviewDuration(params.durationMinutes);
  if (typeof durationResult !== "number") {
    return { ok: false, error: durationResult };
  }

  const linkResult = validateInterviewMeetingLink(params.meetingLink);
  if (linkResult !== null && typeof linkResult !== "string") {
    return { ok: false, error: linkResult };
  }

  return {
    ok: true,
    value: {
      scheduledAt,
      durationMinutes: durationResult,
      meetingLink: linkResult,
    },
  };
}
