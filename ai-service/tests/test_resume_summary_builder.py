"""Structured resume summary builder tests."""

from app.models.parse_resume import ResumeEducationEntry, StructuredResumeParse
from app.nlp.resume_summary_builder import (
    ResumeSummaryBuildInput,
    build_resume_summary,
    build_resume_summary_from_structured_parse,
)


def test_frontend_engineer_example() -> None:
    data = StructuredResumeParse(
        current_designation="Frontend Engineer",
        total_experience=4.0,
        normalized_skills=["react", "typescript", "aws", "git"],
        skills=["React", "TypeScript", "AWS"],
    )
    summary = build_resume_summary_from_structured_parse(data)
    assert "frontend engineer" in summary.lower()
    assert "4 years" in summary.lower()
    assert "React" in summary
    assert "TypeScript" in summary
    assert "AWS" in summary


def test_build_summary_without_designation_infers_role() -> None:
    inputs = ResumeSummaryBuildInput(
        current_designation=None,
        past_roles=(),
        total_experience=3.0,
        normalized_skills=("react", "nextjs", "typescript"),
        skills=("React", "Next.js", "TypeScript"),
        certifications=(),
        education=(),
    )
    summary = build_resume_summary(inputs)
    assert "frontend engineer" in summary.lower()
    assert "3 years" in summary.lower()


def test_recent_graduate_template() -> None:
    inputs = ResumeSummaryBuildInput(
        current_designation=None,
        past_roles=(),
        total_experience=0.0,
        normalized_skills=(),
        skills=(),
        certifications=(),
        education=(
            ResumeEducationEntry(
                degree="Bachelor of Technology in Computer Science",
                college="IIT Delhi",
                graduation_year=2025,
            ),
        ),
    )
    summary = build_resume_summary(inputs)
    assert "recent graduate" in summary.lower()
    assert "bachelor" in summary.lower()
