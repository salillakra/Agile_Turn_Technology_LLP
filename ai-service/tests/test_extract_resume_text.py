"""Tests for PDF text cleaning and extraction helpers."""

from app.utils.extract_resume_text import clean_extracted_text


def test_clean_extracted_text_dehyphenates_line_breaks() -> None:
    raw = "Senior engineer-\ning at Acme"
    assert clean_extracted_text(raw) == "Senior engineering at Acme"


def test_clean_extracted_text_preserves_paragraphs() -> None:
    raw = "Experience\n\nSkills\n\n\n\nPython"
    assert clean_extracted_text(raw) == "Experience\n\nSkills\n\nPython"


def test_clean_extracted_text_strips_control_chars() -> None:
    raw = "Hello\x00World"
    assert clean_extracted_text(raw) == "HelloWorld"
