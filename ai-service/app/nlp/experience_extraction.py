"""
Extract years of experience, job date ranges, and narrative summary from résumé text.

Uses dateparser for heterogeneous dates and regex + optional spaCy for section/role cues.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Iterable

import dateparser

from app.nlp.text_punctuation import truncate_summary_with_full_stop

logger = logging.getLogger(__name__)

MAX_SUMMARY_LEN = 1200
MAX_EXPERIENCE_SECTION_CHARS = 14_000
MAX_JOBS = 20

_PRESENT_TOKENS = frozenset(
    {"present", "current", "now", "ongoing", "till date", "to date", "today"}
)

_EXPERIENCE_HEADER_RE = re.compile(
    r"(?:^|\n)\s*(?:PROFESSIONAL\s+)?(?:WORK\s+)?(?:EXPERIENCE|EMPLOYMENT(?:\s+HISTORY)?|"
    r"WORK\s+HISTORY|CAREER(?:\s+HISTORY)?)\s*[:.]?\s*\n",
    re.IGNORECASE,
)

_EXPERIENCE_SECTION_END_RE = re.compile(
    r"\n(?:\s*)(?=(?:EDUCATION|ACADEM(?:IC|ICS)?|SKILLS?|PROJECTS?|CERTIFICATIONS?|"
    r"AWARDS?|PUBLICATIONS?|SUMMARY|PROFILE|OBJECTIVE|REFERENCES?|LANGUAGES?)\b)",
    re.IGNORECASE,
)

_EXPLICIT_YEARS_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?\.?)(?:\s+of)?(?:\s+(?:professional\s+)?"
    r"experience|\s+exp)?",
    re.IGNORECASE,
)

_EXPLICIT_MONTHS_RE = re.compile(
    r"(\d+)\s*\+?\s*(?:months?|mos?\.?)(?:\s+of)?(?:\s+experience)?",
    re.IGNORECASE,
)

# Jan 2020 – Present | 01/2019 - 12/2021 | 2018 to 2020
_DATE_RANGE_RE = re.compile(
    r"(?P<start>"
    r"(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})|"
    r"(?:\d{1,2}\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*"
    r"\.?\s+\d{2,4}|"
    r"\d{4}"
    r")"
    r"\s*(?:[-–—]|to|until|through|\||,)\s*"
    r"(?P<end>"
    r"present|current|now|ongoing|till\s+date|to\s+date|today|"
    r"(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})|"
    r"(?:\d{1,2}\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*"
    r"\.?\s+\d{2,4}|"
    r"\d{4}"
    r")",
    re.IGNORECASE,
)

_ROLE_LINE_RE = re.compile(
    r"^(.{3,90}?)(?:\s+(?:at|@|\||,)\s+|\s+[-–—]\s+)(.{2,80}?)(?:\s+[-–—|]\s+|\s*,\s*)"
    r"(?=(?:\d{1,2}[/\-.]|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\d{4}))",
    re.IGNORECASE | re.MULTILINE,
)


@dataclass(frozen=True)
class JobDuration:
    title: str | None
    company: str | None
    start: date | None
    end: date | None
    months: float

    @property
    def years(self) -> float:
        return round(self.months / 12.0, 1)


@dataclass(frozen=True)
class ExperienceExtractionResult:
    total_experience: float
    experience_summary: str
    job_durations: tuple[JobDuration, ...] = field(default_factory=tuple)


def extract_experience_from_text(
    text: str,
    *,
    use_spacy: bool = True,
) -> ExperienceExtractionResult:
    """
    Derive total years, per-job durations, and a short experience summary.

    Returns:
        total_experience — years (float, rounded to 1 decimal)
        experience_summary — narrative for embeddings/display
    """
    if not text or not text.strip():
        return ExperienceExtractionResult(
            total_experience=0.0,
            experience_summary="No experience extracted.",
        )

    section = _extract_experience_section(text)
    search_text = section if section else text

    jobs = _extract_job_durations(search_text)

    explicit_years = _infer_explicit_years(text)
    duration_years = _years_from_job_intervals(jobs)
    span_years = _career_span_years(jobs)

    total = _resolve_total_experience(explicit_years, duration_years, span_years)
    summary = _build_experience_summary(search_text, jobs, text)

    return ExperienceExtractionResult(
        total_experience=total,
        experience_summary=summary,
        job_durations=tuple(jobs[:MAX_JOBS]),
    )


def extract_experience_section(full_text: str) -> str:
    """Plain-text EXPERIENCE / EMPLOYMENT block, or empty if not found."""
    return _extract_experience_section(full_text)


def _extract_experience_section(full_text: str) -> str:
    match = _EXPERIENCE_HEADER_RE.search(full_text)
    if not match:
        return ""
    chunk = full_text[match.end() : match.end() + MAX_EXPERIENCE_SECTION_CHARS]
    segment = _EXPERIENCE_SECTION_END_RE.split(chunk, maxsplit=1)[0]
    return segment.strip()


def _parse_date_token(token: str, *, prefer_end: bool = False) -> date | None:
    raw = token.strip()
    if not raw:
        return None
    if raw.lower() in _PRESENT_TOKENS:
        return date.today()

    settings = {
        "PREFER_DATES_FROM": "future" if prefer_end else "past",
        "RELATIVE_BASE": datetime.now(),
        "RETURN_AS_TIMEZONE_AWARE": False,
    }
    if re.fullmatch(r"\d{4}", raw):
        year = int(raw)
        if 1950 <= year <= date.today().year + 1:
            return date(year, 12 if prefer_end else 1, 31 if prefer_end else 1)

    parsed = dateparser.parse(raw, settings=settings)
    if parsed is None:
        return None
    if isinstance(parsed, datetime):
        return parsed.date()
    return parsed


def _extract_job_durations(text: str) -> list[JobDuration]:
    jobs: list[JobDuration] = []
    seen_ranges: set[tuple[str, str]] = set()

    for match in _DATE_RANGE_RE.finditer(text):
        start_raw = match.group("start").strip()
        end_raw = match.group("end").strip()
        key = (start_raw.lower(), end_raw.lower())
        if key in seen_ranges:
            continue
        seen_ranges.add(key)

        start_d = _parse_date_token(start_raw, prefer_end=False)
        end_d = _parse_date_token(end_raw, prefer_end=True)
        if start_d is None:
            continue
        if end_d is None:
            end_d = date.today()
        if end_d < start_d:
            start_d, end_d = end_d, start_d

        months = _months_between(start_d, end_d)
        if months <= 0:
            continue

        title, company = _context_role_company(text, match.start())
        jobs.append(
            JobDuration(
                title=title,
                company=company,
                start=start_d,
                end=end_d,
                months=months,
            )
        )

    return jobs


def _context_role_company(text: str, range_start: int) -> tuple[str | None, str | None]:
    """Look at lines above a date range for title / company patterns."""
    prefix = text[max(0, range_start - 400) : range_start]
    lines = [ln.strip() for ln in prefix.split("\n") if ln.strip()]
    for line in reversed(lines[-4:]):
        role_match = _ROLE_LINE_RE.match(line)
        if role_match:
            return role_match.group(1).strip()[:90], role_match.group(2).strip()[:80]
        if 3 < len(line) < 90 and not _DATE_RANGE_RE.search(line):
            if "|" in line:
                parts = [p.strip() for p in line.split("|") if p.strip()]
                if len(parts) >= 2:
                    return parts[0][:90], parts[1][:80]
            at_split = re.split(r"\s+at\s+", line, maxsplit=1, flags=re.IGNORECASE)
            if len(at_split) == 2 and len(at_split[0].strip()) >= 3:
                return at_split[0].strip()[:90], at_split[1].strip()[:80]
    return None, None


def _months_between(start: date, end: date) -> float:
    days = (end - start).days
    return max(days / 30.4375, 0.0)


def _merge_intervals_months(jobs: Iterable[JobDuration]) -> float:
    intervals: list[tuple[date, date]] = []
    for job in jobs:
        if job.start and job.end:
            intervals.append((job.start, job.end))
    if not intervals:
        return 0.0

    intervals.sort(key=lambda x: x[0])
    merged: list[tuple[date, date]] = []
    for start, end in intervals:
        if not merged or start > merged[-1][1]:
            merged.append((start, end))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))

    total_months = sum(_months_between(s, e) for s, e in merged)
    return total_months / 12.0


def _career_span_years(jobs: list[JobDuration]) -> float:
    starts = [j.start for j in jobs if j.start]
    ends = [j.end for j in jobs if j.end]
    if not starts or not ends:
        return 0.0
    span_months = _months_between(min(starts), max(ends))
    return round(span_months / 12.0, 1)


def _infer_explicit_years(text: str) -> float:
    normalized = re.sub(r"\s+", " ", text)
    years_match = _EXPLICIT_YEARS_RE.search(normalized)
    if years_match:
        value = float(years_match.group(1))
        if value >= 0:
            return min(60.0, round(value, 1))

    months_match = _EXPLICIT_MONTHS_RE.search(normalized)
    if months_match:
        months = int(months_match.group(1))
        if months >= 0:
            return min(60.0, round(months / 12.0, 1))

    return 0.0


def _years_from_job_intervals(jobs: list[JobDuration]) -> float:
    if not jobs:
        return 0.0
    return round(_merge_intervals_months(jobs), 1)


def _resolve_total_experience(
    explicit: float, duration: float, span: float
) -> float:
    if explicit > 0:
        if duration > 0 and explicit < duration * 0.4:
            return min(60.0, duration)
        return min(60.0, explicit)
    if duration > 0:
        return min(60.0, duration)
    if span > 0:
        return min(60.0, span)
    return 0.0


def _build_experience_summary(
    section_text: str,
    jobs: list[JobDuration],
    full_text: str,
) -> str:
    parts: list[str] = []

    for job in jobs[:6]:
        if job.title and job.company:
            parts.append(f"{job.title} at {job.company}")
        elif job.title:
            parts.append(job.title)
        elif job.company:
            parts.append(job.company)

    if parts:
        summary = "; ".join(parts)
    else:
        summary = _summary_from_section_prose(section_text) or _summary_from_section_prose(
            full_text
        )

    summary = re.sub(r"\s+", " ", summary).strip()
    if not summary:
        return truncate_summary_with_full_stop(
            "No experience summary extracted.", MAX_SUMMARY_LEN
        )
    return truncate_summary_with_full_stop(summary, MAX_SUMMARY_LEN)


def _summary_from_section_prose(section_text: str) -> str:
    if not section_text:
        return ""
    lines = [ln.strip() for ln in section_text.split("\n") if ln.strip()]
    prose: list[str] = []
    for line in lines:
        if _DATE_RANGE_RE.search(line):
            continue
        if len(line) < 25:
            continue
        if re.search(r"[@#]|https?://", line):
            continue
        prose.append(line)
        if len(" ".join(prose)) > MAX_SUMMARY_LEN:
            break
    return truncate_summary_with_full_stop(" ".join(prose), MAX_SUMMARY_LEN)
