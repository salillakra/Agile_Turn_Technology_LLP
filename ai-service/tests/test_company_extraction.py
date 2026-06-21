"""Company extraction tests (regex paths; spaCy optional)."""

from app.nlp.company_extraction import extract_companies_from_text
from app.nlp.experience_extraction import JobDuration


def test_companies_from_role_lines_without_spacy() -> None:
    text = """
    EXPERIENCE
    Software Engineer at Acme Corporation
    Jan 2020 - Present
    Developer | Beta Systems Ltd
    2018 - 2019
    EDUCATION
    """
    result = extract_companies_from_text(text, use_spacy=False)
    keys = {c.lower() for c in result.companies}
    assert "acme" in " ".join(keys) or any("acme" in c.lower() for c in result.companies)
    assert any("beta" in c.lower() for c in result.companies)
    assert len(result.companies) == len(set(c.lower() for c in result.companies))


def test_companies_dedupe_suffix() -> None:
    jobs = (
        JobDuration(
            title="Engineer",
            company="Acme Inc.",
            start=None,
            end=None,
            months=12,
        ),
        JobDuration(
            title="Lead",
            company="Acme Corporation",
            start=None,
            end=None,
            months=12,
        ),
    )
    text = "EXPERIENCE\nEngineer at Acme Inc.\n2019-2020\n"
    result = extract_companies_from_text(text, use_spacy=False, job_durations=jobs)
    acme_like = [c for c in result.companies if "acme" in c.lower()]
    assert len(acme_like) == 1
