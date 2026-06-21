"""
Extract job titles / designations from résumé text.

Uses experience job blocks (date ranges), role-line patterns, and title NLP regex.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, timedelta

from app.nlp.experience_extraction import (
    JobDuration,
    extract_experience_from_text,
    extract_experience_section,
)

logger = logging.getLogger(__name__)

MAX_PAST_ROLES = 12
MAX_TITLE_LEN = 90
MIN_TITLE_LEN = 4

# Common technology role patterns (multi-word titles).
_TITLE_PATTERN = re.compile(
    r"\b("
    r"(?:(?:Senior|Sr\.?|Junior|Jr\.?|Lead|Staff|Principal|Associate|Entry[- ]Level|"
    r"Mid[- ]Level|Chief|Head|Vice President|VP|Director|Manager)\s+)?"
    r"(?:Software|Frontend|Front[- ]End|Backend|Back[- ]End|Full[- ]?Stack|Data|DevOps|"
    r"QA|Quality|Product|Project|Business|Systems|Platform|Cloud|Mobile|Web|UI/?UX|UX|"
    r"Machine Learning|ML|AI|Security|Network|Database|Solutions|Technical|Application|"
    r"Infrastructure|Site Reliability|SRE|Salesforce|SAP|SharePoint)\s+"
    r"(?:Engineer|Developer|Analyst|Architect|Manager|Consultant|Designer|Administrator|"
    r"Specialist|Scientist|Programmer|Lead|Intern|Associate)"
    r"|"
    r"(?:Frontend|Backend|Full[- ]?Stack|Data|DevOps|Software|Cloud|Mobile|Web)\s+"
    r"(?:Engineer|Developer|Analyst|Architect)"
    r"|"
    r"Data\s+Analyst|Business\s+Analyst|Systems\s+Analyst|Product\s+Manager|"
    r"Project\s+Manager|Technical\s+Lead|Engineering\s+Manager|Scrum\s+Master"
    r")\b",
    re.IGNORECASE,
)

_ROLE_LINE_TITLE_RE = re.compile(
    r"^(.{3,90}?)(?:\s+(?:at|@|\||,)\s+|\s+[-–—]\s+)(?:[A-Z])",
    re.IGNORECASE | re.MULTILINE,
)

_TITLE_REJECT_RE = re.compile(
    r"\b(?:university|college|institute|school|bachelor|master|phd|mba|certification|"
    r"skills?|experience|education|references?|present|current)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class DesignationExtractionResult:
    current_designation: str | None
    past_roles: tuple[str, ...]


def extract_designations_from_text(
    text: str,
    *,
    use_spacy: bool = True,
    job_durations: tuple[JobDuration, ...] | None = None,
) -> DesignationExtractionResult:
    """
    Detect current designation and historical roles.

    Current role: title from the most recent job (by end date; ongoing/Present first).
    Past roles: earlier titles, deduped, stable order.
    """
    if not text or not text.strip():
        return DesignationExtractionResult(current_designation=None, past_roles=())

    section = extract_experience_section(text)
    search_text = section if section else text

    if job_durations is None:
        exp = extract_experience_from_text(text, use_spacy=use_spacy)
        job_durations = exp.job_durations

    ordered_titles = _titles_from_jobs(job_durations)
    ordered_titles.extend(_titles_from_patterns(search_text))
    ordered_titles.extend(_titles_from_role_lines(search_text))

    current, past = _split_current_and_past(ordered_titles, job_durations)
    return DesignationExtractionResult(
        current_designation=current,
        past_roles=tuple(past[:MAX_PAST_ROLES]),
    )


def _titles_from_jobs(jobs: tuple[JobDuration, ...] | list[JobDuration]) -> list[str]:
    if not jobs:
        return []

    sorted_jobs = sorted(
        jobs,
        key=lambda j: (
            _job_end_sort_key(j),
            j.start or date.min,
        ),
        reverse=True,
    )

    titles: list[str] = []
    for job in sorted_jobs:
        if job.title:
            cleaned = _clean_title(job.title)
            if cleaned and _is_plausible_title(cleaned):
                titles.append(cleaned)
    return titles


def _job_end_sort_key(job: JobDuration) -> date:
    if job.end is None:
        return date.today()
    if _is_current_job(job):
        return date.today()
    return job.end


def _is_current_job(job: JobDuration) -> bool:
    if job.end is None:
        return True
    today = date.today()
    if job.end >= today - timedelta(days=31):
        return True
    return False


def _titles_from_patterns(text: str) -> list[str]:
    found: list[str] = []
    for match in _TITLE_PATTERN.finditer(text):
        cleaned = _clean_title(match.group(1))
        if cleaned and _is_plausible_title(cleaned):
            found.append(cleaned)
    return found


def _titles_from_role_lines(text: str) -> list[str]:
    found: list[str] = []
    for match in _ROLE_LINE_TITLE_RE.finditer(text):
        cleaned = _clean_title(match.group(1))
        if cleaned and _is_plausible_title(cleaned):
            found.append(cleaned)
    return found


def _split_current_and_past(
    titles: list[str],
    jobs: tuple[JobDuration, ...] | list[JobDuration],
) -> tuple[str | None, list[str]]:
    deduped = _dedupe_titles(titles)
    if not deduped:
        return None, []

    current_from_job: str | None = None
    if jobs:
        sorted_jobs = sorted(
            jobs,
            key=lambda j: (_job_end_sort_key(j), j.start or date.min),
            reverse=True,
        )
        for job in sorted_jobs:
            if job.title and _is_current_job(job):
                cleaned = _clean_title(job.title)
                if cleaned and _is_plausible_title(cleaned):
                    current_from_job = cleaned
                    break
        if current_from_job is None and sorted_jobs:
            first_title = _clean_title(sorted_jobs[0].title or "")
            if first_title and _is_plausible_title(first_title):
                current_from_job = first_title

    current = current_from_job or deduped[0]
    past: list[str] = []
    current_key = _title_dedupe_key(current) if current else ""

    for title in deduped:
        key = _title_dedupe_key(title)
        if key == current_key:
            continue
        if key not in {_title_dedupe_key(p) for p in past}:
            past.append(title)

    return current, past


def _clean_title(raw: str) -> str:
    t = re.sub(r"\s+", " ", raw.strip())
    t = re.sub(r"\s+at\s+.+$", "", t, flags=re.IGNORECASE).strip()
    t = re.sub(r"\s*\|\s*.+$", "", t).strip()
    t = re.sub(r"\s*[-–—|]\s*.*$", "", t).strip()
    if len(t) > MAX_TITLE_LEN:
        t = t[:MAX_TITLE_LEN].strip()
    return t


def _title_dedupe_key(title: str) -> str:
    return re.sub(r"\s+", " ", title.lower().strip())


def _is_plausible_title(title: str) -> bool:
    if len(title) < MIN_TITLE_LEN or len(title) > MAX_TITLE_LEN:
        return False
    if _TITLE_REJECT_RE.search(title):
        return False
    if re.search(r"[@#]|https?://", title):
        return False
    if title.isdigit():
        return False
    words = title.split()
    if len(words) > 8:
        return False
    return bool(_TITLE_PATTERN.search(title) or re.search(r"(?:Engineer|Developer|Analyst|Manager|Architect|Consultant|Designer|Lead|Intern)", title, re.I))


def _dedupe_titles(titles: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in titles:
        cleaned = _clean_title(raw)
        if not cleaned or not _is_plausible_title(cleaned):
            continue
        key = _title_dedupe_key(cleaned)
        if key in seen:
            continue
        seen.add(key)
        out.append(_clean_title_display(cleaned))
    return out


def _clean_title_display(title: str) -> str:
    """Title-case words while keeping common tech tokens (e.g. DevOps, UI/UX)."""
    parts = []
    for word in title.split():
        if word.upper() in {"UI/UX", "SRE", "QA", "VP", "ML", "AI", "SAP"}:
            parts.append(word.upper() if word.upper() == word else word)
        elif word.lower() in {"devops", "frontend", "backend"}:
            parts.append(word.capitalize())
        else:
            parts.append(word[:1].upper() + word[1:].lower() if len(word) > 1 else word.upper())
    return " ".join(parts)
