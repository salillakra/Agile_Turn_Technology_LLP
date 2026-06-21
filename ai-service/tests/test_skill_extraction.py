"""Tests for skill extraction from plain text."""

from app.nlp.skill_extraction import extract_skills_from_text


def test_extract_skills_from_skills_section_without_spacy() -> None:
    text = """
    Jane Doe
    SKILLS
    React.js, Node JS, TypeScript, Docker
    EXPERIENCE
    Software Engineer at Acme
    """
    result = extract_skills_from_text(text, use_spacy=False)
    assert "react" in result.normalized_skills
    assert "nodejs" in result.normalized_skills
    assert "typescript" in result.normalized_skills
    assert len(result.normalized_skills) == len(set(result.normalized_skills))


def test_extract_skills_dictionary_phrase_match() -> None:
    text = "Built APIs with FastAPI and PostgreSQL on AWS."
    result = extract_skills_from_text(text, use_spacy=False)
    assert "fastapi" in result.normalized_skills
    assert "postgresql" in result.normalized_skills
    assert "aws" in result.normalized_skills
