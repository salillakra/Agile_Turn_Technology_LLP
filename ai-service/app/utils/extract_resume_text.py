"""
Extract plain text from PDF résumés for downstream NLP (spaCy / transformers).

Uses PyMuPDF (fast, digital PDFs) with pdfplumber fallback (layout-heavy CVs).
"""

from __future__ import annotations

import io
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO

logger = logging.getLogger(__name__)

# If PyMuPDF yields less than this, try pdfplumber (scanned / odd layout).
_MIN_USABLE_CHARS = 80

# Control chars except newline/tab.
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# De-hyphenate line breaks: "engineer-\ning" -> "engineering" when lowercase follows.
_SOFT_HYPHEN_BREAK_RE = re.compile(r"(\w)-\n(\w)", re.UNICODE)
# Collapse spaces/tabs on a single line (keep newlines).
_INLINE_SPACE_RE = re.compile(r"[^\S\n]+")
# More than two consecutive newlines -> paragraph break (double newline).
_MULTI_BLANK_LINES_RE = re.compile(r"\n{3,}")


@dataclass(frozen=True)
class ResumeTextExtractionResult:
    """Outcome of PDF text extraction (before NLP)."""

    text: str
    ok: bool
    page_count: int
    engine: str
    warnings: tuple[str, ...] = field(default_factory=tuple)

    @property
    def char_count(self) -> int:
        return len(self.text)


def clean_extracted_text(raw: str) -> str:
    """
    Normalize extracted PDF text for NLP: unicode cleanup, de-hyphenation,
    preserved paragraph breaks, trimmed lines.
    """
    if not raw:
        return ""

    text = unicodedata.normalize("NFKC", raw)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_CHAR_RE.sub("", text)
    text = _SOFT_HYPHEN_BREAK_RE.sub(r"\1\2", text)

    lines: list[str] = []
    for line in text.split("\n"):
        collapsed = _INLINE_SPACE_RE.sub(" ", line).strip()
        lines.append(collapsed)

    text = "\n".join(lines)
    text = _MULTI_BLANK_LINES_RE.sub("\n\n", text)
    return text.strip()


def _read_pdf_bytes(source: bytes | BinaryIO | Path | str) -> bytes:
    if isinstance(source, bytes):
        return source
    if isinstance(source, (str, Path)):
        path = Path(source)
        return path.read_bytes()
    return source.read()


def _extract_with_pymupdf(pdf_bytes: bytes) -> tuple[str, int, list[str]]:
    import fitz  # PyMuPDF

    warnings: list[str] = []
    parts: list[str] = []

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        warnings.append(f"PyMuPDF open failed: {exc}")
        return "", 0, warnings

    try:
        page_count = doc.page_count
        for index in range(page_count):
            try:
                page = doc.load_page(index)
                # sort=True approximates reading order for multi-column CVs.
                page_text = page.get_text("text", sort=True) or ""
                if page_text.strip():
                    parts.append(page_text.strip())
            except Exception as exc:
                warnings.append(f"PyMuPDF page {index + 1} failed: {exc}")
    finally:
        doc.close()

    return "\n\n".join(parts), page_count, warnings


def _extract_with_pdfplumber(pdf_bytes: bytes) -> tuple[str, int, list[str]]:
    import pdfplumber

    warnings: list[str] = []
    parts: list[str] = []

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as doc:
            page_count = len(doc.pages)
            for index, page in enumerate(doc.pages):
                try:
                    page_text = page.extract_text(layout=True) or page.extract_text() or ""
                    if page_text.strip():
                        parts.append(page_text.strip())
                except Exception as exc:
                    warnings.append(f"pdfplumber page {index + 1} failed: {exc}")
    except Exception as exc:
        warnings.append(f"pdfplumber open failed: {exc}")
        return "", 0, warnings

    return "\n\n".join(parts), page_count, warnings


def extract_resume_text_result(
    source: bytes | BinaryIO | Path | str,
    *,
    min_usable_chars: int = _MIN_USABLE_CHARS,
) -> ResumeTextExtractionResult:
    """
    Extract and clean text from a PDF résumé.

    Tries PyMuPDF first, then pdfplumber if the yield is low or PyMuPDF fails.
    Never raises for malformed PDFs — returns `ok=False` and empty/minimal text.
    """
    warnings: list[str] = []

    try:
        pdf_bytes = _read_pdf_bytes(source)
    except OSError as exc:
        return ResumeTextExtractionResult(
            text="",
            ok=False,
            page_count=0,
            engine="none",
            warnings=(f"Could not read PDF bytes: {exc}",),
        )

    if not pdf_bytes:
        return ResumeTextExtractionResult(
            text="",
            ok=False,
            page_count=0,
            engine="none",
            warnings=("PDF input is empty.",),
        )

    pymupdf_text, page_count, pymupdf_warnings = _extract_with_pymupdf(pdf_bytes)
    warnings.extend(pymupdf_warnings)

    cleaned_pymupdf = clean_extracted_text(pymupdf_text)
    if len(cleaned_pymupdf) >= min_usable_chars:
        return ResumeTextExtractionResult(
            text=cleaned_pymupdf,
            ok=True,
            page_count=page_count,
            engine="pymupdf",
            warnings=tuple(warnings),
        )

    if cleaned_pymupdf:
        warnings.append(
            f"PyMuPDF yield below {min_usable_chars} chars; trying pdfplumber."
        )
    else:
        warnings.append("PyMuPDF produced no usable text; trying pdfplumber.")

    plumber_text, plumber_pages, plumber_warnings = _extract_with_pdfplumber(pdf_bytes)
    warnings.extend(plumber_warnings)
    cleaned_plumber = clean_extracted_text(plumber_text)

    if len(cleaned_plumber) >= len(cleaned_pymupdf):
        best_text = cleaned_plumber
        engine = "pdfplumber"
        pages = plumber_pages or page_count
    else:
        best_text = cleaned_pymupdf
        engine = "pymupdf" if cleaned_pymupdf else "none"
        pages = page_count

    ok = len(best_text) >= min_usable_chars
    if not ok and best_text:
        warnings.append(
            f"Extracted text shorter than {min_usable_chars} chars; NLP quality may be poor."
        )
    if not ok and not best_text:
        warnings.append("No text could be extracted from PDF.")

    if warnings:
        logger.info(
            "PDF text extraction engine=%s pages=%s chars=%s warnings=%s",
            engine,
            pages,
            len(best_text),
            warnings,
        )

    return ResumeTextExtractionResult(
        text=best_text,
        ok=ok,
        page_count=pages,
        engine=engine,
        warnings=tuple(warnings),
    )


def extract_resume_text(
    source: bytes | BinaryIO | Path | str,
    *,
    min_usable_chars: int = _MIN_USABLE_CHARS,
) -> str:
    """Return cleaned plain text only (convenience wrapper)."""
    return extract_resume_text_result(
        source, min_usable_chars=min_usable_chars
    ).text


def extract_resume_text_from_bytes(
    pdf_bytes: bytes,
    *,
    min_usable_chars: int = _MIN_USABLE_CHARS,
) -> str:
    """Extract cleaned text from raw PDF bytes."""
    return extract_resume_text(pdf_bytes, min_usable_chars=min_usable_chars)


def extract_resume_text_from_path(
    path: str | Path,
    *,
    min_usable_chars: int = _MIN_USABLE_CHARS,
) -> str:
    """Extract cleaned text from a PDF file path."""
    return extract_resume_text(path, min_usable_chars=min_usable_chars)
