import { describe, expect, it } from "vitest";
import {
  buildResumeParseReviewForm,
  confidenceLabelForScore,
  reviewFormToApplyBody,
} from "@/src/lib/resume-parse-review";

describe("resume-parse-review", () => {
  it("builds form from embedded structured parse", () => {
    const form = buildResumeParseReviewForm("job1", {
      name: "Jane Doe",
      skills: ["React"],
      experience: { years: 4, summary: "Fallback" },
      structured: {
        schemaVersion: 10,
        skills: ["React", "TypeScript"],
        normalizedSkills: ["react", "typescript"],
        companies: ["Acme"],
        currentDesignation: "Frontend Engineer",
        education: [{ degree: "B.Sc.", college: "MIT", graduationYear: 2020 }],
        certifications: ["AWS Certified Developer"],
        totalExperience: 4,
        summary: "Frontend engineer with 4 years experience.",
        skillsConfidence: 0.8,
        experienceConfidence: 0.7,
        educationConfidence: 0.6,
      },
    });
    expect(form).not.toBeNull();
    expect(form!.skills).toEqual(["React", "TypeScript"]);
    expect(form!.companies).toEqual(["Acme"]);
    expect(confidenceLabelForScore(form!.skillsConfidence)).toBe("high");
  });

  it("maps edited form to apply body", () => {
    const form = buildResumeParseReviewForm("job1", {
      name: "Jane",
      skills: ["Go"],
      experience: { years: 2, summary: "x" },
    });
    expect(form).not.toBeNull();
    const body = reviewFormToApplyBody({ ...form!, skills: ["Go", "Rust"] });
    expect(body.structured.skills).toEqual(["Go", "Rust"]);
    expect(body.result.name).toBe("Jane");
  });
});
