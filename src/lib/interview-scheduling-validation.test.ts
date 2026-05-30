import { describe, expect, it } from "vitest";
import {
  validateInterviewDuration,
  validateInterviewMeetingLink,
  validateInterviewMeetingLinkHostname,
  validateInterviewScheduleInput,
  validateInterviewScheduledAtWindow,
  validateInterviewerPanelSize,
  INTERVIEW_SCHEDULE_MIN_DURATION_MINUTES,
  INTERVIEW_SCHEDULE_MAX_DURATION_MINUTES,
  DEFAULT_INTERVIEW_SCHEDULE_MAX_HORIZON_DAYS,
} from "@/src/lib/interview-scheduling-validation";

describe("validateInterviewDuration", () => {
  it("accepts bounds", () => {
    expect(validateInterviewDuration(INTERVIEW_SCHEDULE_MIN_DURATION_MINUTES)).toBe(5);
    expect(validateInterviewDuration(INTERVIEW_SCHEDULE_MAX_DURATION_MINUTES)).toBe(480);
  });

  it("rejects non-integers and out of range", () => {
    expect(validateInterviewDuration(4)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(validateInterviewDuration(481)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(validateInterviewDuration(30.5)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("validateInterviewMeetingLink", () => {
  it("allows null and empty", () => {
    expect(validateInterviewMeetingLink(null)).toBeNull();
    expect(validateInterviewMeetingLink("   ")).toBeNull();
  });

  it("accepts https URLs", () => {
    expect(validateInterviewMeetingLink("https://meet.example.com/room/abc")).toBe(
      "https://meet.example.com/room/abc"
    );
  });

  it("rejects dangerous schemes", () => {
    expect(validateInterviewMeetingLink("javascript:alert(1)")).toMatchObject({
      code: "INVALID_MEETING_LINK",
    });
  });

  it("rejects invalid URLs", () => {
    expect(validateInterviewMeetingLink("not a url")).toMatchObject({
      code: "INVALID_MEETING_LINK",
    });
  });

  it("rejects localhost and private IPs", () => {
    expect(validateInterviewMeetingLink("http://localhost/room")).toMatchObject({
      code: "INVALID_MEETING_LINK",
    });
    expect(validateInterviewMeetingLink("https://192.168.0.5/meet")).toMatchObject({
      code: "INVALID_MEETING_LINK",
    });
  });

  it("rejects credentials in URL", () => {
    expect(validateInterviewMeetingLink("https://user:pass@zoom.us/j/1")).toMatchObject({
      code: "INVALID_MEETING_LINK",
    });
  });
});

describe("validateInterviewMeetingLinkHostname", () => {
  it("allows public hostnames", () => {
    expect(validateInterviewMeetingLinkHostname("meet.google.com")).toBeNull();
  });
});

describe("validateInterviewScheduledAtWindow", () => {
  it("rejects times in the past", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    const err = validateInterviewScheduledAtWindow(
      new Date("2026-06-01T12:05:00.000Z"),
      now
    );
    expect(err?.code).toBe("SCHEDULE_IN_PAST");
  });

  it("accepts times beyond default lead", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    expect(
      validateInterviewScheduledAtWindow(
        new Date("2026-06-01T13:00:00.000Z"),
        now
      )
    ).toBeNull();
  });

  it("rejects schedules beyond max horizon", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    const tooFar = new Date(
      now + (DEFAULT_INTERVIEW_SCHEDULE_MAX_HORIZON_DAYS + 1) * 24 * 60 * 60_000
    );
    expect(validateInterviewScheduledAtWindow(tooFar, now)?.code).toBe(
      "SCHEDULE_TOO_FAR"
    );
  });
});

describe("validateInterviewScheduleInput", () => {
  it("validates a complete payload", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    const result = validateInterviewScheduleInput({
      scheduledAt: "2026-06-02T14:00:00.000Z",
      durationMinutes: 60,
      meetingLink: "https://zoom.us/j/123",
      nowMs: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.durationMinutes).toBe(60);
      expect(result.value.meetingLink).toContain("zoom.us");
    }
  });
});

describe("validateInterviewerPanelSize", () => {
  it("rejects oversized panels", () => {
    expect(validateInterviewerPanelSize(50)?.code).toBe("VALIDATION_ERROR");
  });
});
