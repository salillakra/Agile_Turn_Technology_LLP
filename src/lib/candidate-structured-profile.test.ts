import { describe, expect, it } from "vitest";
import {
  candidateStructuredProfileFromParse,
  normalizeCertificationList,
  normalizeCompanyList,
  normalizeEducationEntries,
  normalizeProfileSummary,
} from "@/src/lib/candidate-structured-profile";
import type { StructuredResumeParse } from "@/src/lib/structured-resume-parse";

describe("candidate-structured-profile", () => {
  it("normalizes structured parse for storage", () => {
    const parsed: StructuredResumeParse = {
      schemaVersion: 8,
      skills: ["React"],
      normalizedSkills: ["react"],
      companies: ["Acme Inc", "acme inc"],
      currentDesignation: "Frontend Engineer",
      education: [
        {
          degree: "B.Sc. Computer Science",
          college: "University of Mumbai",
          graduationYear: 2018,
        },
      ],
      certifications: ["AWS Certified Developer", "AWS Certified Developer"],
      totalExperience: 4,
      summary: "  Frontend engineer with 4 years experience.  ",
    };

    const profile = candidateStructuredProfileFromParse(parsed);
    expect(profile.summary).toBe("Frontend engineer with 4 years experience.");
    expect(profile.companies).toEqual(["Acme Inc"]);
    expect(profile.certifications).toEqual(["AWS Certified Developer"]);
    expect(profile.education).toHaveLength(1);
    expect(profile.education?.[0].graduationYear).toBe(2018);
  });

  it("dedupes companies case-insensitively", () => {
    expect(normalizeCompanyList(["Foo Corp", "foo corp", "Bar"])).toEqual([
      "Foo Corp",
      "Bar",
    ]);
  });

  it("rejects invalid graduation years", () => {
    expect(
      normalizeEducationEntries([
        { degree: "B.A.", college: null, graduationYear: 1800 },
      ])
    ).toEqual([{ degree: "B.A.", college: null, graduationYear: null }]);
  });

  it("truncates long summary", () => {
    expect(normalizeProfileSummary("x".repeat(600))?.length).toBe(500);
  });

  it("normalizes certification list", () => {
    expect(normalizeCertificationList(["  GCP Pro  ", "GCP Pro"])).toEqual(["GCP Pro"]);
  });
});
