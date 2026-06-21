"""Education extraction tests."""

from app.nlp.education_extraction import extract_education_from_text


def test_education_section_multiline_block() -> None:
    text = """
    EDUCATION
    Bachelor of Technology in Computer Science
    Indian Institute of Technology Delhi
    2016 - 2020
    EXPERIENCE
  Software Engineer
    """
    result = extract_education_from_text(text, use_spacy=False)
    assert len(result.education) >= 1
    entry = result.education[0]
    assert entry.degree is not None
    assert "bachelor" in entry.degree.lower()
    assert entry.college is not None
    assert "institute" in entry.college.lower() or "iit" in entry.college.lower()
    assert entry.graduation_year == 2020


def test_combined_line_format() -> None:
    text = """
    EDUCATION
    B.Sc. Computer Science, University of Mumbai, 2018
  """
    result = extract_education_from_text(text, use_spacy=False)
    assert len(result.education) == 1
    assert result.education[0].graduation_year == 2018
    assert result.education[0].college is not None


def test_multiple_degrees_in_one_section() -> None:
    text = """
    EDUCATION
    Bachelor of Science in Computer Science
    Massachusetts Institute of Technology
    2018
    Master of Business Administration
    Harvard University
    2022
    EXPERIENCE
    """
    result = extract_education_from_text(text, use_spacy=False)
    assert len(result.education) == 2
    bachelors = result.education[0]
    masters = result.education[1]
    assert bachelors.graduation_year == 2018
    assert masters.graduation_year == 2022
    assert bachelors.college is not None
    assert "mit" in bachelors.college.lower() or "massachusetts" in bachelors.college.lower()
    assert masters.college is not None
    assert "harvard" in masters.college.lower()
