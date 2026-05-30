import { stringField } from "@/src/lib/email/templates/layout";

export type ParsedInterviewSchedule = {
  date: string;
  time: string;
  timeZoneLabel: string;
};

function resolveTimeZone(data: Record<string, unknown>): string {
  return (
    stringField(data, "timeZone") ||
    process.env.EMAIL_INTERVIEW_TIMEZONE?.trim() ||
    "UTC"
  );
}

/**
 * Resolve display date/time from ISO `interviewDate` or explicit `date` / `time` fields.
 */
export function parseInterviewSchedule(
  data: Record<string, unknown>
): ParsedInterviewSchedule {
  const tz = resolveTimeZone(data);
  const explicitDate = stringField(data, "interviewDateDisplay") || stringField(data, "date");
  const explicitTime = stringField(data, "interviewTime") || stringField(data, "time");

  if (explicitDate && explicitTime) {
    return {
      date: explicitDate,
      time: explicitTime,
      timeZoneLabel: tz,
    };
  }

  const iso = stringField(data, "interviewDate");
  if (!iso) {
    return {
      date: "To be confirmed",
      time: "To be confirmed",
      timeZoneLabel: tz,
    };
  }

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: iso, time: "—", timeZoneLabel: tz };
  }

  return {
    date: new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeZone: tz,
    }).format(d),
    time: new Intl.DateTimeFormat("en-GB", {
      timeStyle: "short",
      timeZone: tz,
    }).format(d),
    timeZoneLabel: tz,
  };
}

export function resolveInterviewer(data: Record<string, unknown>): string {
  return (
    stringField(data, "interviewer") ||
    stringField(data, "interviewerName") ||
    stringField(data, "interviewers") ||
    ""
  );
}

export function resolveMeetingLink(data: Record<string, unknown>): string {
  return (
    stringField(data, "meetingLink") ||
    stringField(data, "meeting_link") ||
    stringField(data, "location") ||
    stringField(data, "url") ||
    ""
  );
}
