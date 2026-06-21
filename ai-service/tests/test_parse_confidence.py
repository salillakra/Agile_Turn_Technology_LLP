"""Parse confidence scoring tests."""

from app.nlp.education_extraction import extract_education_from_text
from app.nlp.experience_extraction import extract_experience_from_text
from app.nlp.parse_confidence import compute_parse_confidence
from app.nlp.skill_extraction import extract_skills_from_text


def test_skills_confidence_high_with_skills_section() -> None:
    text = """
    SKILLS
    React, TypeScript, Node.js, AWS, PostgreSQL, Docker
    EXPERIENCE
    5 years of experience
    """
    skill_result = extract_skills_from_text(text, use_spacy=False)
    exp_result = extract_experience_from_text(text, use_spacy=False)
    edu_result = extract_education_from_text(text, use_spacy=False)
    scores = compute_parse_confidence(
        text,
        skill_result=skill_result,
        exp_result=exp_result,
        education_result=edu_result,
        use_spacy=False,
    )
    assert 0.0 <= scores.skills_confidence <= 1.0
    assert scores.skills_confidence >= 0.5


def test_experience_confidence_with_explicit_years_and_jobs() -> None:
    text = """
    EXPERIENCE
    Software Engineer at Acme | Jan 2020 – Present
    Developer at Beta | 2018 – 2019
    6+ years of professional experience
    """
    skill_result = extract_skills_from_text(text, use_spacy=False)
    exp_result = extract_experience_from_text(text, use_spacy=False)
    edu_result = extract_education_from_text(text, use_spacy=False)
    scores = compute_parse_confidence(
        text,
        skill_result=skill_result,
        exp_result=exp_result,
        education_result=edu_result,
        use_spacy=False,
    )
    assert scores.experience_confidence >= 0.6


def test_education_confidence_with_complete_block() -> None:
    text = """
    EDUCATION
    Bachelor of Technology in Computer Science
    Indian Institute of Technology Delhi
    2016 - 2020
    EXPERIENCE
    """
    skill_result = extract_skills_from_text(text, use_spacy=False)
    exp_result = extract_experience_from_text(text, use_spacy=False)
    edu_result = extract_education_from_text(text, use_spacy=False)
    scores = compute_parse_confidence(
        text,
        skill_result=skill_result,
        exp_result=exp_result,
        education_result=edu_result,
        use_spacy=False,
    )
    assert scores.education_confidence >= 0.65


def test_empty_resume_returns_zero_confidence() -> None:
    text = "   "
    skill_result = extract_skills_from_text(text, use_spacy=False)
    exp_result = extract_experience_from_text(text, use_spacy=False)
    edu_result = extract_education_from_text(text, use_spacy=False)
    scores = compute_parse_confidence(
        text,
        skill_result=skill_result,
        exp_result=exp_result,
        education_result=edu_result,
        use_spacy=False,
    )
    assert scores.skills_confidence == 0.0
    assert scores.experience_confidence == 0.0
    assert scores.education_confidence == 0.0
