"""Tests for experience extraction (no spaCy required)."""

from app.nlp.experience_extraction import extract_experience_from_text


def test_explicit_years_of_experience() -> None:
    text = "Professional summary. 8+ years of professional experience in software."
    result = extract_experience_from_text(text, use_spacy=False)
    assert result.total_experience == 8.0
    assert len(result.experience_summary) > 0


def test_job_date_ranges_sum() -> None:
    text = """
    EXPERIENCE
    Software Engineer at Acme Corp
    Jan 2020 - Present
    Junior Developer | Beta Inc
    01/2018 - 12/2019
    EDUCATION
    BSc Computer Science
    """
    result = extract_experience_from_text(text, use_spacy=False)
    assert result.total_experience >= 5.0
    assert len(result.job_durations) >= 2
    assert "Acme" in result.experience_summary or "Software" in result.experience_summary


def test_empty_text() -> None:
    result = extract_experience_from_text("", use_spacy=False)
    assert result.total_experience == 0.0
