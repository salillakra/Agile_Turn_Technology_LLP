"""
Extract education entries (degree, institution, graduation year) from résumé text.

Uses EDUCATION section parsing, degree/year regex, and optional spaCy ORG for schools.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

MAX_EDUCATION_ENTRIES = 8
MAX_FIELD_LEN = 120

_EDUCATION_HEADER_RE = re.compile(
    r"(?:^|\n)\s*(?:EDUCATION|ACADEMIC(?:\s+BACKGROUND)?|QUALIFICATIONS?)\s*[:.]?\s*\n",
    re.IGNORECASE,
)

_EDUCATION_SECTION_END_RE = re.compile(
    r"\n(?:\s*)(?=(?:EXPERIENCE|EMPLOYMENT|WORK\s+HISTORY|SKILLS?|PROJECTS?|"
    r"CERTIFICATIONS?|AWARDS?|PUBLICATIONS?|SUMMARY|PROFILE|OBJECTIVE|REFERENCES?|"
    r"LANGUAGES?|INTERESTS?)\b)",
    re.IGNORECASE,
)

_YEAR_RE = re.compile(
    r"(?:\b(?:graduated|graduation|completed|expected|class\s+of)\s*[:.]?\s*)?"
    r"(\d{4})"
    r"(?:\s*[-–—]\s*(\d{4}))?",
    re.IGNORECASE,
)

_DEGREE_PATTERN = re.compile(
    r"\b("
    r"(?:Bachelor|Master|Doctor|Associate)\s+of\s+(?:Science|Arts|Technology|Engineering|"
    r"Business(?:\s+Administration)?|Computer(?:\s+Science)?|Applications?)"
    r"|"
    r"(?:B\.?\s*Tech\.?|B\.?\s*E\.?|B\.?\s*Sc\.?|B\.?\s*A\.?|M\.?\s*Tech\.?|M\.?\s*Sc\.?|"
    r"M\.?\s*A\.?|MBA|Ph\.?\s*D\.?|B\.?\s*Com\.?|M\.?\s*Com\.?|BBA|BCA|MCA)"
    r"(?:\s+in\s+[A-Za-z][A-Za-z\s&/-]{2,40})?"
    r")\b",
    re.IGNORECASE,
)

_INSTITUTION_LINE_RE = re.compile(
    r"\b("
    r"(?:[A-Z][A-Za-z0-9&.'\s-]{2,80}?\s+)?"
    r"(?:University|College|Institute|School|Polytechnic|Academy|IIT|NIT|BITS)\b"
    r"[A-Za-z0-9&.,'\s-]{0,60}"
    r")",
    re.IGNORECASE,
)

_COMBINED_LINE_RE = re.compile(
    r"^(?P<degree>.+?),\s*(?P<college>[A-Z][^,]{2,80}?),\s*(?P<year>(?:19|20)\d{2})\s*$",
    re.IGNORECASE | re.MULTILINE,
)

_INSTITUTION_REJECT_RE = re.compile(
    r"\b(?:high\s+school|secondary|primary|matriculation)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class EducationEntry:
    degree: str | None
    college: str | None
    graduation_year: int | None


@dataclass(frozen=True)
class EducationExtractionResult:
    education: tuple[EducationEntry, ...]


def extract_education_from_text(
    text: str,
    *,
    use_spacy: bool = True,
) -> EducationExtractionResult:
    """Extract degree, college/university, and graduation year per education block."""
    if not text or not text.strip():
        return EducationExtractionResult(education=())

    section = _extract_education_section(text)
    search_text = section if section else text

    blocks = _split_education_blocks(search_text)
    entries: list[EducationEntry] = []

    for block in blocks:
        entry = _parse_education_block(block, use_spacy=use_spacy)
        if entry and _entry_has_content(entry):
            entries.append(entry)

    if not entries and search_text:
        entry = _parse_education_block(search_text, use_spacy=use_spacy)
        if entry and _entry_has_content(entry):
            entries.append(entry)

    deduped = _dedupe_education(entries)
    return EducationExtractionResult(education=tuple(deduped[:MAX_EDUCATION_ENTRIES]))


def extract_education_section(full_text: str) -> str:
    """Plain-text EDUCATION block, or empty."""
    return _extract_education_section(full_text)


def _extract_education_section(full_text: str) -> str:
    match = _EDUCATION_HEADER_RE.search(full_text)
    if not match:
        return ""
    chunk = full_text[match.end() : match.end() + 12_000]
    segment = _EDUCATION_SECTION_END_RE.split(chunk, maxsplit=1)[0]
    return segment.strip()


def _split_education_blocks(section: str) -> list[str]:
    lines = [ln.strip() for ln in section.replace("\r", "\n").split("\n")]
    blocks: list[str] = []
    current: list[str] = []

    for line in lines:
        if not line:
            if current:
                blocks.append("\n".join(current))
                current = []
            continue
        if re.match(r"^[\u2022\u2023•·▪▸►‣⁃*-]\s+", line) or re.match(r"^\d{1,2}[.)]\s+", line):
            if current:
                blocks.append("\n".join(current))
            current = [re.sub(r"^[\u2022\u2023•·▪▸►‣⁃*-]\s+|^\d{1,2}[.)]\s+", "", line).strip()]
            continue
        current.append(line)

    if current:
        blocks.append("\n".join(current))

    if len(blocks) <= 1 and section.strip():
        parts = re.split(r"\n{2,}", section.strip())
        if len(parts) > 1:
            blocks = [p.strip() for p in parts if p.strip()]

    expanded: list[str] = []
    for block in blocks:
        expanded.extend(_split_block_on_repeated_degrees(block))
    return [b for b in expanded if b.strip()]


def _split_block_on_repeated_degrees(block: str) -> list[str]:
    """Split a single EDUCATION chunk when multiple degree lines appear back-to-back."""
    lines = [ln.strip() for ln in block.replace("\r", "\n").split("\n") if ln.strip()]
    if len(lines) < 2:
        return [block] if block.strip() else []

    degree_starts: list[int] = []
    for idx, line in enumerate(lines):
        if _is_year_only_line(line):
            continue
        if _DEGREE_PATTERN.search(line):
            degree_starts.append(idx)
            continue
        if idx == 0 and not _line_looks_like_institution(line):
            degree_starts.append(idx)

    if len(degree_starts) <= 1:
        return [block]

    subblocks: list[str] = []
    for k, start in enumerate(degree_starts):
        end = degree_starts[k + 1] if k + 1 < len(degree_starts) else len(lines)
        chunk = "\n".join(lines[start:end]).strip()
        if chunk:
            subblocks.append(chunk)
    return subblocks or [block]


def _parse_education_block(block: str, *, use_spacy: bool) -> EducationEntry | None:
    combined = _COMBINED_LINE_RE.search(block)
    if combined:
        year = int(combined.group("year"))
        return EducationEntry(
            degree=_clean_field(combined.group("degree")),
            college=_clean_field(combined.group("college")),
            graduation_year=_valid_year(year),
        )

    lines = [ln.strip() for ln in block.replace("\r", "\n").split("\n") if ln.strip()]
    if len(lines) >= 2:
        return _parse_multiline_education_block(lines, use_spacy=use_spacy)

    degree = _extract_degree(block)
    college = _extract_institution(block, use_spacy=use_spacy, skip_lines=())
    grad_year = _extract_graduation_year(block)

    if not degree and college and grad_year:
        first_line = lines[0] if lines else block.split("\n")[0].strip()
        if first_line and not _INSTITUTION_LINE_RE.search(first_line):
            degree = _clean_field(first_line)

    return EducationEntry(
        degree=degree,
        college=college,
        graduation_year=grad_year,
    )


def _parse_multiline_education_block(
    lines: list[str],
    *,
    use_spacy: bool,
) -> EducationEntry:
    """One block: degree line, institution line(s), optional year line."""
    degree: str | None = None
    degree_line_idx: int | None = None
    college: str | None = None

    for idx, line in enumerate(lines):
        if _is_year_only_line(line):
            continue
        match = _DEGREE_PATTERN.search(line)
        if match:
            degree = _clean_field(match.group(0))
            degree_line_idx = idx
            break

    if degree is None and lines and not _is_year_only_line(lines[0]):
        first = lines[0]
        if not _line_looks_like_institution(first):
            degree = _clean_field(first)
            degree_line_idx = 0

    for idx, line in enumerate(lines):
        if degree_line_idx is not None and idx == degree_line_idx:
            continue
        if _is_year_only_line(line):
            continue
        if _line_looks_like_institution(line):
            college = _institution_from_line(line)
            if college:
                break

    if college is None and use_spacy:
        body = "\n".join(
            line
            for idx, line in enumerate(lines)
            if idx != degree_line_idx and not _is_year_only_line(line)
        )
        college = _extract_institution(body, use_spacy=True, skip_lines=lines)

    grad_year = _extract_graduation_year("\n".join(lines))
    return EducationEntry(degree=degree, college=college, graduation_year=grad_year)


def _extract_degree(text: str) -> str | None:
    match = _DEGREE_PATTERN.search(text)
    if match:
        return _clean_field(match.group(0))
    for line in text.split("\n"):
        line = line.strip()
        match = _DEGREE_PATTERN.search(line)
        if match:
            return _clean_field(match.group(0))
    return None


def _line_looks_like_institution(line: str) -> bool:
    return bool(_INSTITUTION_LINE_RE.search(line))


def _institution_from_line(line: str) -> str | None:
    """Prefer the full line when it is clearly a school/university row."""
    cleaned = _clean_field(line)
    if cleaned and _is_plausible_institution(cleaned):
        return cleaned
    for match in _INSTITUTION_LINE_RE.finditer(line):
        candidate = _clean_field(match.group(1))
        if candidate and _is_plausible_institution(candidate) and not _degree_prefix_in_institution(
            line, candidate
        ):
            return candidate
    return None


def _degree_prefix_in_institution(line: str, institution: str) -> bool:
    """Reject captures that include a degree phrase before the school name."""
    idx = line.lower().find(institution.lower())
    if idx <= 0:
        return False
    prefix = line[:idx]
    return bool(_DEGREE_PATTERN.search(prefix))


def _is_year_only_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if _YEAR_RE.fullmatch(stripped.replace(" ", "")):
        return True
    if re.fullmatch(r"\d{4}\s*[-–—]\s*\d{4}", stripped):
        return True
    if re.fullmatch(r"(?:\d{4}\s*[-–—]\s*)?\d{4}", stripped):
        return True
    years = list(_YEAR_RE.finditer(stripped))
    if years and len(stripped) <= 24:
        remainder = _YEAR_RE.sub("", stripped).strip(" -–—,.")
        if not remainder or len(remainder) < 4:
            return True
    return False


def _extract_institution(
    text: str,
    *,
    use_spacy: bool,
    skip_lines: tuple[str, ...] = (),
) -> str | None:
    skip_lower = {ln.strip().lower() for ln in skip_lines if ln.strip()}

    for line in text.split("\n"):
        line = line.strip()
        if line.lower() in skip_lower:
            continue
        if _is_year_only_line(line):
            continue
        inst = _institution_from_line(line)
        if inst:
            return inst

    if use_spacy:
        try:
            from app.nlp_pipeline import get_nlp_pipeline

            nlp = get_nlp_pipeline()
            doc = nlp(text[:20_000])
            for ent in doc.ents:
                if ent.label_ != "ORG":
                    continue
                candidate = _clean_field(ent.text)
                if candidate and _is_plausible_institution(candidate):
                    return candidate
        except Exception as exc:
            logger.debug("spaCy ORG for education skipped: %s", exc)

    return None


def _extract_graduation_year(text: str) -> int | None:
    years: list[int] = []
    for match in _YEAR_RE.finditer(text):
        start_y = int(match.group(1))
        end_y = int(match.group(2)) if match.group(2) else start_y
        if _valid_year(end_y):
            years.append(end_y)
        elif _valid_year(start_y):
            years.append(start_y)

    if not years:
        return None
    return max(years)


def _valid_year(value: int) -> int | None:
    if 1950 <= value <= 2035:
        return value
    return None


def _clean_field(raw: str | None) -> str | None:
    if raw is None:
        return None
    t = re.sub(r"\s+", " ", raw.strip())
    t = t.strip(" ,.;|-")
    if not t:
        return None
    if len(t) > MAX_FIELD_LEN:
        t = t[:MAX_FIELD_LEN].strip()
    return t


def _is_plausible_institution(name: str) -> bool:
    if len(name) < 4:
        return False
    if _INSTITUTION_REJECT_RE.search(name):
        return False
    if not _INSTITUTION_LINE_RE.search(name):
        return False
    return True


def _entry_has_content(entry: EducationEntry) -> bool:
    return bool(entry.degree or entry.college or entry.graduation_year)


def _dedupe_education(entries: list[EducationEntry]) -> list[EducationEntry]:
    out: list[EducationEntry] = []
    seen: set[tuple[str, str, int | None]] = set()
    for entry in entries:
        key = (
            (entry.degree or "").lower(),
            (entry.college or "").lower(),
            entry.graduation_year,
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(entry)
    return out
