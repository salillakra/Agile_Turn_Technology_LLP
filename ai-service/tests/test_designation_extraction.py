"""Designation / role extraction tests."""

from app.nlp.designation_extraction import extract_designations_from_text


def test_current_and_past_roles_from_experience() -> None:
    text = """
    EXPERIENCE
    Software Engineer at Acme Corp
    Jan 2020 - Present
    Frontend Developer | Beta Ltd
    Jun 2017 - Dec 2019
    Data Analyst
    Intern at Gamma
    2016 - 2017
    EDUCATION
    """
    result = extract_designations_from_text(text, use_spacy=False)
    assert result.current_designation is not None
    assert "engineer" in result.current_designation.lower()
    assert len(result.past_roles) >= 1
    assert result.current_designation not in result.past_roles


def test_title_pattern_in_summary() -> None:
    text = "SUMMARY\nExperienced Data Analyst with 5 years in analytics.\n"
    result = extract_designations_from_text(text, use_spacy=False)
    assert result.current_designation is not None
    assert "analyst" in result.current_designation.lower()
