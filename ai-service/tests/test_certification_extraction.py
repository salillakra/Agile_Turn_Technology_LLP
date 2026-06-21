"""Certification extraction tests."""

from app.nlp.certification_extraction import extract_certifications_from_text


def test_certification_section_aws_and_gcp() -> None:
    text = """
    CERTIFICATIONS
    AWS Certified Developer – Associate
    Google Cloud Professional Cloud Architect
    EXPERIENCE
    Software Engineer
    """
    result = extract_certifications_from_text(text, use_spacy=False)
    assert len(result.certifications) >= 2
    joined = " | ".join(result.certifications).lower()
    assert "aws" in joined and "developer" in joined
    assert "google cloud" in joined


def test_google_cloud_professional_shorthand() -> None:
    text = """
    CERTIFICATIONS
    Google Cloud Professional
    """
    result = extract_certifications_from_text(text, use_spacy=False)
    assert len(result.certifications) >= 1
    assert "google cloud professional" in result.certifications[0].lower()


def test_pattern_match_without_section() -> None:
    text = "Profile summary. AWS Certified Solutions Architect – Professional. Skills: Java"
    result = extract_certifications_from_text(text, use_spacy=False)
    assert any("aws" in c.lower() for c in result.certifications)
