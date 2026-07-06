"""Orchestrate resume PDF text extraction and NLP structuring."""

from __future__ import annotations

import logging
from pathlib import Path

from app.config import get_settings
from app.models.parse_resume import (
    STRUCTURED_RESUME_PARSE_SCHEMA_VERSION,
    ParseResumeResponse,
    ResumeEducationEntry,
    StructuredResumeParse,
)
from app.nlp.certification_extraction import extract_certifications_from_text
from app.nlp.company_extraction import extract_companies_from_text
from app.nlp.designation_extraction import extract_designations_from_text
from app.nlp.education_extraction import extract_education_from_text
from app.nlp.experience_extraction import extract_experience_from_text
from app.nlp.resume_summary_builder import build_resume_summary_from_structured_parse
from app.nlp.parse_confidence import compute_parse_confidence
from app.nlp.skill_extraction import extract_skills_from_text
from app.services.resume_path import resolve_resume_pdf_path
from app.utils.extract_resume_text import extract_resume_text_result

logger = logging.getLogger(__name__)


def build_structured_resume_parse_from_text(raw_text: str) -> StructuredResumeParse:
    """Run NLP extractors and return the canonical structured parse object."""
    settings = get_settings()
    use_spacy = settings.resume_nlp_enabled

    skill_result = extract_skills_from_text(raw_text, use_spacy=use_spacy)
    exp_result = extract_experience_from_text(raw_text, use_spacy=use_spacy)
    job_durations = exp_result.job_durations

    company_result = extract_companies_from_text(
        raw_text,
        use_spacy=use_spacy,
        job_durations=job_durations,
    )
    designation_result = extract_designations_from_text(
        raw_text,
        use_spacy=use_spacy,
        job_durations=job_durations,
    )
    education_result = extract_education_from_text(raw_text, use_spacy=use_spacy)
    certification_result = extract_certifications_from_text(raw_text, use_spacy=use_spacy)

    confidence = compute_parse_confidence(
        raw_text,
        skill_result=skill_result,
        exp_result=exp_result,
        education_result=education_result,
        use_spacy=use_spacy,
    )

    parsed = StructuredResumeParse(
        schema_version=STRUCTURED_RESUME_PARSE_SCHEMA_VERSION,
        skills=list(skill_result.skills),
        normalized_skills=list(skill_result.normalized_skills),
        total_experience=float(exp_result.total_experience),
        companies=list(company_result.companies),
        current_designation=designation_result.current_designation,
        education=[
            ResumeEducationEntry(
                degree=entry.degree,
                college=entry.college,
                graduation_year=entry.graduation_year,
            )
            for entry in education_result.education
        ],
        certifications=list(certification_result.certifications),
        summary="",
        skills_confidence=confidence.skills_confidence,
        experience_confidence=confidence.experience_confidence,
        education_confidence=confidence.education_confidence,
    )
    return parsed.model_copy(
        update={"summary": build_resume_summary_from_structured_parse(parsed)},
    )


# Back-compat alias
build_extracted_data_from_text = build_structured_resume_parse_from_text


def parse_resume_from_path(
    file_path: str,
    *,
    resume_files_base_path: Path | None,
) -> ParseResumeResponse:
    """Read PDF at `file_path`, return `rawText` and canonical structured fields."""
    resolved = resolve_resume_pdf_path(file_path, resume_files_base_path)

    extraction = extract_resume_text_result(resolved)
    if extraction.warnings:
        logger.info(
            "parse-resume path=%s engine=%s warnings=%s",
            resolved,
            extraction.engine,
            list(extraction.warnings),
        )

    if not extraction.ok and not extraction.text:
        logger.warning(
            "parse-resume produced little or no text path=%s engine=%s",
            resolved,
            extraction.engine,
        )

    structured = (
        build_structured_resume_parse_from_text(extraction.text)
        if extraction.text.strip()
        else StructuredResumeParse(schema_version=STRUCTURED_RESUME_PARSE_SCHEMA_VERSION)
    )

    return ParseResumeResponse(
        raw_text=extraction.text,
        **structured.model_dump(),
    )
