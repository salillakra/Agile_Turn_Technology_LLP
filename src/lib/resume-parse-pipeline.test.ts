import { describe, expect, it } from "vitest";
import { buildCandidateSemanticTextFromParse } from "@/src/lib/candidate-semantic-text";

describe("resume parse → semantic profile", () => {
  it("builds profile from skills, summary, designation, experience", () => {
    const text = buildCandidateSemanticTextFromParse({
      skills: ["React", "TypeScript", "AWS"],
      summary: "Frontend engineer with 4 years experience in React, TypeScript and AWS.",
      designation: "Frontend Engineer",
      experienceYears: 4,
    });
    expect(text).toContain("Frontend Engineer");
    expect(text).toContain("Skills: React, TypeScript, AWS");
    expect(text).toContain("Experience: 4 years");
    expect(text).toContain("Frontend engineer with 4 years");
  });
});
