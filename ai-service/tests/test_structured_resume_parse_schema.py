"""Canonical structured parse response schema."""

from app.models.parse_resume import (
    STRUCTURED_RESUME_PARSE_SCHEMA_VERSION,
    ParseResumeResponse,
    StructuredResumeParse,
)
from app.services.parse_resume import build_structured_resume_parse_from_text


def test_parse_resume_response_has_flat_canonical_fields() -> None:
    response = ParseResumeResponse(
        raw_text="text",
        skills=["React"],
        normalized_skills=["react"],
        companies=["Acme"],
        current_designation="Engineer",
        total_experience=2.0,
        summary="Engineer with 2 years experience in React.",
    )
    dumped = response.model_dump(by_alias=True)
    assert dumped["rawText"] == "text"
    assert dumped["schemaVersion"] == STRUCTURED_RESUME_PARSE_SCHEMA_VERSION
    assert set(dumped.keys()) == {
        "rawText",
        "schemaVersion",
        "skills",
        "normalizedSkills",
        "companies",
        "currentDesignation",
        "education",
        "certifications",
        "totalExperience",
        "summary",
        "skillsConfidence",
        "experienceConfidence",
        "educationConfidence",
    }


def test_build_structured_parse_from_sample_text() -> None:
    text = """
    SKILLS
    React, TypeScript, AWS
    EXPERIENCE
    Frontend Engineer at Acme
    4 years of experience
    """
    parsed = build_structured_resume_parse_from_text(text)
    assert isinstance(parsed, StructuredResumeParse)
    assert parsed.schema_version == STRUCTURED_RESUME_PARSE_SCHEMA_VERSION
    assert parsed.summary.endswith(".")
    assert "react" in parsed.normalized_skills or "typescript" in parsed.normalized_skills
    assert 0.0 <= parsed.skills_confidence <= 1.0
    assert 0.0 <= parsed.experience_confidence <= 1.0
    assert 0.0 <= parsed.education_confidence <= 1.0
