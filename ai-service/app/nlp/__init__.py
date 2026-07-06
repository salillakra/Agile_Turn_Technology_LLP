"""NLP utilities for resume parsing."""

from app.nlp.company_extraction import CompanyExtractionResult, extract_companies_from_text
from app.nlp.designation_extraction import (
    DesignationExtractionResult,
    extract_designations_from_text,
)
from app.nlp.education_extraction import (
    EducationEntry,
    EducationExtractionResult,
    extract_education_from_text,
)
from app.nlp.experience_extraction import (
    ExperienceExtractionResult,
    JobDuration,
    extract_experience_from_text,
    extract_experience_section,
)
from app.nlp.skill_extraction import SkillExtractionResult, extract_skills_from_text
from app.nlp.skill_normalizer import normalize_skill, normalize_skills_list

__all__ = [
    "CompanyExtractionResult",
    "DesignationExtractionResult",
    "extract_companies_from_text",
    "extract_designations_from_text",
    "EducationEntry",
    "EducationExtractionResult",
    "extract_education_from_text",
    "ExperienceExtractionResult",
    "JobDuration",
    "extract_experience_from_text",
    "extract_experience_section",
    "SkillExtractionResult",
    "extract_skills_from_text",
    "normalize_skill",
    "normalize_skills_list",
]
