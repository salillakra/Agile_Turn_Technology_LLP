"""Request/response schemas for POST /parse-resume."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

# Bump when the structured field set or semantics change.
STRUCTURED_RESUME_PARSE_SCHEMA_VERSION = 10


class ParseResumeRequest(BaseModel):
    """Path to a PDF résumé readable by this service (local or shared volume)."""

    model_config = ConfigDict(populate_by_name=True)

    file_path: str = Field(
        ...,
        alias="filePath",
        min_length=1,
        description="Absolute or base-relative path to a .pdf résumé file",
    )


class ResumeEducationEntry(BaseModel):
    """One degree / institution row from the EDUCATION section."""

    model_config = ConfigDict(populate_by_name=True)

    degree: str | None = None
    college: str | None = Field(
        None,
        description="College or university name",
    )
    graduation_year: int | None = Field(None, alias="graduationYear")


class StructuredResumeParse(BaseModel):
    """
    Canonical structured résumé parse (fixed field set).

    Used by POST /parse-resume and intended to match the ATS `StructuredResumeParse`
    TypeScript contract. Do not add ad-hoc keys without bumping `schemaVersion`.
    """

    model_config = ConfigDict(populate_by_name=True)

    schema_version: int = Field(
        STRUCTURED_RESUME_PARSE_SCHEMA_VERSION,
        alias="schemaVersion",
        description="Structured parse contract version",
    )
    skills: list[str] = Field(
        default_factory=list,
        description="Raw skill labels as detected in the résumé",
    )
    normalized_skills: list[str] = Field(
        default_factory=list,
        alias="normalizedSkills",
        description="Canonical skill tokens (deduped), aligned with ATS skill-normalizer",
    )
    companies: list[str] = Field(
        default_factory=list,
        description="Previous employers (deduped)",
    )
    current_designation: str | None = Field(
        None,
        alias="currentDesignation",
        description="Most recent / current job title",
    )
    education: list[ResumeEducationEntry] = Field(
        default_factory=list,
        description="Degrees with college/university and graduation year",
    )
    certifications: list[str] = Field(
        default_factory=list,
        description="Professional certifications (AWS, GCP, Azure, etc.)",
    )
    total_experience: float = Field(
        0.0,
        alias="totalExperience",
        description="Total years of experience",
    )
    summary: str = Field(
        default="",
        description="One-line structured summary from extracted entities (rule-based, no LLM)",
    )
    skills_confidence: float = Field(
        0.0,
        alias="skillsConfidence",
        ge=0.0,
        le=1.0,
        description="Rule-based confidence for skills extraction (0–1)",
    )
    experience_confidence: float = Field(
        0.0,
        alias="experienceConfidence",
        ge=0.0,
        le=1.0,
        description="Rule-based confidence for years of experience / job ranges (0–1)",
    )
    education_confidence: float = Field(
        0.0,
        alias="educationConfidence",
        ge=0.0,
        le=1.0,
        description="Rule-based confidence for education[] extraction (0–1)",
    )


class ParseResumeResponse(StructuredResumeParse):
    """
    POST /parse-resume response: PDF plain text plus canonical structured fields.

    JSON shape (camelCase):
    {
      "rawText": "...",
      "schemaVersion": 10,
      "skills": [],
      "normalizedSkills": [],
      "companies": [],
      "currentDesignation": null,
      "education": [],
      "certifications": [],
      "totalExperience": 0,
      "summary": "",
      "skillsConfidence": 0,
      "experienceConfidence": 0,
      "educationConfidence": 0
    }
    """

    model_config = ConfigDict(populate_by_name=True)

    raw_text: str = Field(
        ...,
        alias="rawText",
        description="Cleaned plain text from PDF extraction",
    )


# Back-compat alias for internal modules migrating off the old name.
ExtractedData = StructuredResumeParse
ExtractedEducationEntry = ResumeEducationEntry
