import { describe, expect, it } from "vitest";
import {
  computeInterviewTimeRange,
  intervalsOverlap,
} from "@/src/lib/interview-scheduling-conflicts";

describe("intervalsOverlap", () => {
  it("detects partial overlap", () => {
    expect(intervalsOverlap(0, 60, 30, 90)).toBe(true);
  });

  it("returns false for adjacent non-overlapping intervals", () => {
    expect(intervalsOverlap(0, 60, 60, 120)).toBe(false);
  });

  it("returns false when one interval is fully before the other", () => {
    expect(intervalsOverlap(0, 30, 60, 90)).toBe(false);
  });
});

describe("computeInterviewTimeRange", () => {
  it("computes end from duration", () => {
    const start = new Date("2026-05-27T10:00:00.000Z");
    const range = computeInterviewTimeRange(start, 45);
    expect(range.startMs).toBe(start.getTime());
    expect(range.endMs).toBe(start.getTime() + 45 * 60_000);
  });
});
