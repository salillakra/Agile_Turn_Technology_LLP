"""
Extract previous employer names from resume text using spaCy NER (ORG).

Combines ORG entities in the experience section, role-line parsing, and job-duration hints.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.nlp.experience_extraction import (
    JobDuration,
    extract_experience_section,
    extract_experience_from_text,
)

logger = logging.getLogger(__name__)

MAX_COMPANIES = 15
MIN_COMPANY_LEN = 2
MAX_COMPANY_LEN = 80

# Normalized keys — not employers (products, platforms, section noise).
_ORG_BLOCKLIST_KEYS = frozenset(
    {
        "aws",
        "amazon web services",
        "gcp",
        "google cloud",
        "azure",
        "linkedin",
        "github",
        "gitlab",
        "bitbucket",
        "stackoverflow",
        "leetcode",
        "gfg",
        "geeksforgeeks",
        "coursera",
        "udemy",
        "edx",
        "docker",
        "kubernetes",
        "react",
        "typescript",
        "javascript",
        "python",
        "java",
        "agile",
        "scrum",
        "jira",
        "confluence",
        "microsoft office",
        "office",
        "excel",
        "word",
        "powerpoint",
        "sql",
        "nosql",
        "rest",
        "graphql",
        "experience",
        "skills",
        "education",
        "projects",
        "summary",
        "profile",
        "objective",
        "references",
        "present",
        "current",
        "remote",
        "hybrid",
    }
)

_SUFFIX_RE = re.compile(
    r"\s*,?\s*\b(?:inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|plc|gmbh|sa|ag)\.?\s*$",
    re.IGNORECASE,
)

_AT_COMPANY_RE = re.compile(
    r"\b(?:at|@)\s+([A-Z][A-Za-z0-9&][A-Za-z0-9&.\s,'-]{1,70})"
    r"(?=\s*[-–—|,]|\s+\d{1,2}[/\-.]|\s+\d{4}|\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\n|$)",
)

_PIPE_COMPANY_RE = re.compile(
    r"^[A-Z][A-Za-z0-9\s/&.-]{2,60}?\s+\|\s+([A-Z][A-Za-z0-9][A-Za-z0-9&.\s,'-]{1,70})",
    re.MULTILINE,
)


@dataclass(frozen=True)
class CompanyExtractionResult:
    companies: tuple[str, ...]


def extract_companies_from_text(
    text: str,
    *,
    use_spacy: bool = True,
    job_durations: tuple[JobDuration, ...] | None = None,
) -> CompanyExtractionResult:
    """
    Detect previous employers; dedupe while preserving first-seen order.

    Uses spaCy `ORG` NER on the experience section, regex role lines, and optional
    companies from job duration parsing.
    """
    if not text or not text.strip():
        return CompanyExtractionResult(companies=())

    section = extract_experience_section(text)
    search_text = section if section else text

    candidates: list[str] = []

    if job_durations is None and not section:
        exp = extract_experience_from_text(text, use_spacy=use_spacy)
        job_durations = exp.job_durations

    if job_durations:
        for job in job_durations:
            if job.company:
                candidates.append(job.company)

    candidates.extend(_extract_at_company_phrases(search_text))
    candidates.extend(_extract_pipe_companies(search_text))

    if use_spacy:
        try:
            candidates.extend(_extract_org_entities_ner(search_text))
        except RuntimeError:
            logger.debug("spaCy unavailable; company extraction without NER")
        except Exception as exc:
            logger.warning("spaCy ORG extraction failed: %s", exc)

    companies = _dedupe_companies(candidates)
    return CompanyExtractionResult(companies=tuple(companies[:MAX_COMPANIES]))


def _extract_org_entities_ner(text: str) -> list[str]:
    from app.nlp_pipeline import get_nlp_pipeline

    nlp = get_nlp_pipeline()
    doc = nlp(text[:80_000])
    found: list[str] = []
    for ent in doc.ents:
        if ent.label_ != "ORG":
            continue
        cleaned = _clean_company_surface(ent.text)
        if cleaned and _is_plausible_company(cleaned):
            found.append(cleaned)
    return found


def _extract_at_company_phrases(text: str) -> list[str]:
    found: list[str] = []
    for match in _AT_COMPANY_RE.finditer(text):
        cleaned = _clean_company_surface(match.group(1))
        if cleaned and _is_plausible_company(cleaned):
            found.append(cleaned)
    return found


def _extract_pipe_companies(text: str) -> list[str]:
    found: list[str] = []
    for match in _PIPE_COMPANY_RE.finditer(text):
        cleaned = _clean_company_surface(match.group(1))
        if cleaned and _is_plausible_company(cleaned):
            found.append(cleaned)
    return found


_TRAILING_DATE_RE = re.compile(
    r"\s+(?:"
    r"(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})|"
    r"(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})|"
    r"\d{4}"
    r")(?:\s*[-–—]\s*(?:present|current|\d{4}|[A-Za-z]+\s+\d{4}).*)?$",
    re.IGNORECASE,
)


def _clean_company_surface(raw: str) -> str:
    t = re.sub(r"\s+", " ", raw.strip())
    t = _TRAILING_DATE_RE.sub("", t).strip()
    t = t.strip(" ,.;|")
    if len(t) > MAX_COMPANY_LEN:
        t = t[:MAX_COMPANY_LEN].strip()
    return t


def _company_dedupe_key(name: str) -> str:
    key = name.lower().strip()
    key = _SUFFIX_RE.sub("", key).strip()
    key = re.sub(r"[^a-z0-9& ]", "", key)
    key = re.sub(r"\s+", " ", key).strip()
    # Drop trailing legal suffix token left after regex (e.g. "acme corp" → "acme").
    key = re.sub(r"\s+(?:corp|co)$", "", key).strip()
    return key


def _is_plausible_company(name: str) -> bool:
    if len(name) < MIN_COMPANY_LEN or len(name) > MAX_COMPANY_LEN:
        return False
    key = _company_dedupe_key(name)
    if not key or key in _ORG_BLOCKLIST_KEYS:
        return False
    if key.isdigit():
        return False
    if re.fullmatch(r"[a-z]{1,2}", key):
        return False
    # Mostly section headers
    if key in {"work", "employment", "professional", "career"}:
        return False
    # Likely a university (still valid employer) — keep; filter only pure "university" token
    if key == "university":
        return False
    return True


def _dedupe_companies(candidates: list[str]) -> list[str]:
    ordered: list[str] = []
    keys: list[str] = []

    for raw in candidates:
        cleaned = _clean_company_surface(raw)
        if not cleaned or not _is_plausible_company(cleaned):
            continue
        key = _company_dedupe_key(cleaned)
        if not key:
            continue

        merged = False
        for index, existing_key in enumerate(keys):
            if key == existing_key or key in existing_key or existing_key in key:
                if len(cleaned) > len(ordered[index]):
                    ordered[index] = cleaned
                    keys[index] = key
                merged = True
                break
        if not merged:
            ordered.append(cleaned)
            keys.append(key)

    return ordered
