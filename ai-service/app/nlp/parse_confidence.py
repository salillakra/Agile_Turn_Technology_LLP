"""
Rule-based confidence scores (0–1) for résumé NLP extractions.

Signals: section headers, field completeness, explicit statements, and job-date coverage.
No LLM — auditable heuristics aligned with each extractor's evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.nlp.education_extraction import (
    EducationEntry,
    EducationExtractionResult,
    extract_education_section,
)
from app.nlp.experience_extraction import (
    ExperienceExtractionResult,
    extract_experience_section,
)
from app.nlp.skill_extraction import SkillExtractionResult, skills_section_candidate_count

_EXPLICIT_YEARS_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?\.?)(?:\s+of)?(?:\s+(?:professional\s+)?"
    r"experience|\s+exp)?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ParseConfidenceScores:
    skills_confidence: float
    experience_confidence: float
    education_confidence: float


def _clamp01(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 3)


def _education_entry_completeness(entry: EducationEntry) -> float:
    """0–1 completeness for one education row."""
    fields = sum(
        1
        for v in (entry.degree, entry.college, entry.graduation_year)
        if v is not None and (not isinstance(v, str) or v.strip())
    )
    if fields >= 3:
        return 1.0
    if fields == 2:
        return 0.65
    if fields == 1:
        return 0.35
    return 0.0


def score_skills_confidence(
    text: str,
    skill_result: SkillExtractionResult,
    *,
    use_spacy: bool,
) -> float:
    normalized = skill_result.normalized_skills
    raw = skill_result.skills
    if not normalized and not raw:
        return 0.0

    score = 0.2
    section_count = skills_section_candidate_count(text)
    if section_count >= 5:
        score += 0.3
    elif section_count >= 2:
        score += 0.22
    elif section_count >= 1:
        score += 0.12

    n = len(normalized) if normalized else len(raw)
    if n >= 8:
        score += 0.22
    elif n >= 5:
        score += 0.18
    elif n >= 3:
        score += 0.12
    elif n >= 1:
        score += 0.06

    if raw and normalized:
        from app.nlp.skill_normalizer import normalize_skill

        hits = sum(1 for label in raw if normalize_skill(label))
        ratio = hits / max(len(raw), 1)
        if ratio >= 0.75:
            score += 0.12
        elif ratio >= 0.5:
            score += 0.06

    if use_spacy and normalized:
        score += 0.08

    return _clamp01(score)


def score_experience_confidence(
    text: str,
    exp_result: ExperienceExtractionResult,
) -> float:
    total = exp_result.total_experience
    jobs = exp_result.job_durations
    has_section = bool(extract_experience_section(text).strip())
    explicit = bool(_EXPLICIT_YEARS_RE.search(text))

    if total <= 0 and not jobs and not explicit:
        return 0.0

    score = 0.15
    if has_section:
        score += 0.28
    if explicit:
        score += 0.25
    if total > 0:
        score += 0.18
    if len(jobs) >= 3:
        score += 0.2
    elif len(jobs) == 2:
        score += 0.14
    elif len(jobs) == 1:
        score += 0.08

    dated_jobs = sum(1 for j in jobs if j.start is not None)
    if dated_jobs >= 2:
        score += 0.12
    elif dated_jobs == 1:
        score += 0.06

    return _clamp01(score)


def score_education_confidence(
    text: str,
    education_result: EducationExtractionResult,
) -> float:
    entries = education_result.education
    has_section = bool(extract_education_section(text).strip())

    if not entries:
        return _clamp01(0.22 if has_section else 0.0)

    score = 0.25 if has_section else 0.15
    completeness_sum = sum(_education_entry_completeness(e) for e in entries)
    avg_complete = completeness_sum / len(entries)
    score += 0.35 * avg_complete

    if len(entries) >= 2 and avg_complete >= 0.65:
        score += 0.12

    if all(e.graduation_year is not None for e in entries if e.degree or e.college):
        score += 0.08

    return _clamp01(score)


def compute_parse_confidence(
    text: str,
    *,
    skill_result: SkillExtractionResult,
    exp_result: ExperienceExtractionResult,
    education_result: EducationExtractionResult,
    use_spacy: bool,
) -> ParseConfidenceScores:
    """Aggregate per-field confidence in [0, 1] from extractor outputs and source text."""
    return ParseConfidenceScores(
        skills_confidence=score_skills_confidence(
            text, skill_result, use_spacy=use_spacy
        ),
        experience_confidence=score_experience_confidence(text, exp_result),
        education_confidence=score_education_confidence(text, education_result),
    )
