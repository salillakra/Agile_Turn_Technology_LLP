"""
Extract professional certifications from resume text.

Parses CERTIFICATIONS / LICENSES sections and matches vendor-specific cert patterns
(AWS, Google Cloud, Azure, Cisco, CompTIA, etc.).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

MAX_CERTIFICATIONS = 20
MAX_CERT_LEN = 100

_CERTIFICATION_HEADER_RE = re.compile(
    r"(?:^|\n)\s*("
    r"CERTIFICATIONS?|"
    r"LICENSES?(?:\s+(?:AND|&)\s+CERTIFICATIONS?)?|"
    r"PROFESSIONAL\s+CERTIFICATIONS?|"
    r"CREDENTIALS?"
    r")\s*[:.]?\s*\n",
    re.IGNORECASE,
)

_CERTIFICATION_SECTION_END_RE = re.compile(
    r"\n(?:\s*)(?=(?:EXPERIENCE|EMPLOYMENT|WORK\s+HISTORY|EDUCATION|ACADEMIC|"
    r"SKILLS?|PROJECTS?|AWARDS?|PUBLICATIONS?|SUMMARY|PROFILE|OBJECTIVE|"
    r"REFERENCES?|LANGUAGES?|INTERESTS?|VOLUNTEER)\b)",
    re.IGNORECASE,
)

_DATE_SUFFIX_RE = re.compile(
    r"\s*[-–—|,]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?"
    r"(?:19|20)\d{2}(?:\s*[-–—]\s*(?:19|20)\d{2})?.*$",
    re.IGNORECASE,
)
_PAREN_METADATA_RE = re.compile(
    r"\s*\((?:issued|expires?|valid|credential|license|in\s+progress)[^)]*\)\s*",
    re.IGNORECASE,
)
_TRAILING_PAREN_YEAR_RE = re.compile(r"\s*\((?:19|20)\d{2}[^)]*\)\s*$")

_LINE_NOISE_RE = re.compile(
    r"^(?:credential\s+id|license\s+(?:no|number)|issued\s+on|expires?\s+on|"
    r"valid\s+(?:through|until)|in\s+progress|verification\s+url)\b",
    re.IGNORECASE,
)

_PLACEHOLDER_RE = re.compile(
    r"\b(?:industry[- ]recognized|relevant|various|multiple|professional)\s+certifications?\b",
    re.IGNORECASE,
)

# High-confidence patterns (safe to scan outside the cert section).
_CERT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\bAWS\s+Certified\s+[\w][\w\s/&-]{1,50}"
        r"(?:\s*[-–—]\s*(?:Associate|Professional))?",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bGoogle\s+Cloud\s+(?:Professional|Associate|User)\s+[\w][\w\s/&-]{0,50}",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bGoogle\s+Cloud\s+Professional\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:Microsoft\s+)?Azure\s+(?:Fundamentals|Administrator|Developer|"
        r"Solutions\s+Architect|Security\s+Engineer|Data\s+Engineer|"
        r"AI\s+Engineer|DevOps\s+Engineer)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bMicrosoft\s+Certified\s*:\s*[\w][\w\s/&-]{2,50}",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:Oracle\s+Certified\s+[\w][\w\s/&-]{2,40}|OCA|OCP|OCM)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bC(?:CNA|CNP|CIE)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bCompTIA\s+(?:A\+|Network\+|Security\+|Cloud\+|CySA\+|PenTest\+|CASP\+)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:Certified\s+)?Kubernetes\s+(?:Administrator|Application\s+Developer|"
        r"Security\s+Specialist)\s*(?:\(CKA|CKAD|CKS\))?",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bHashiCorp\s+Certified\s*:\s*[\w][\w\s/&-]{2,40}",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bSalesforce\s+Certified\s+[\w][\w\s/&-]{2,40}\s+(?:Administrator|Developer|"
        r"Consultant|Architect|Specialist)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:PMP|PMI[- ]ACP|Certified\s+Scrum\s+Master|CSM|PSM\s+I|PSM\s+II|"
        r"SAFe\s+\d+\s+[\w\s]+|ITIL\s+v?\d|CISSP|CISA|CEH|CISM)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bIBM\s+Certified\s+[\w][\w\s/&-]{2,40}",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bRed\s+Hat\s+Certified\s+[\w][\w\s/&-]{2,40}",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bTerraform\s+Associate\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?!AWS\b)([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})\s+Certified\s+"
        r"([A-Za-z][A-Za-z0-9\s/&-]{2,40})",
        re.IGNORECASE,
    ),
)


@dataclass(frozen=True)
class CertificationExtractionResult:
    certifications: tuple[str, ...]


def extract_certifications_from_text(
    text: str,
    *,
    use_spacy: bool = True,  # noqa: ARG001 — reserved for future NER
) -> CertificationExtractionResult:
    """Return deduped certification labels (e.g. AWS Certified Developer)."""
    del use_spacy
    if not text or not text.strip():
        return CertificationExtractionResult(certifications=())

    candidates: list[str] = []

    section = _extract_certification_section(text)
    if section:
        candidates.extend(_extract_from_section(section))
    else:
        candidates.extend(_extract_pattern_matches(text))

    if section:
        candidates.extend(_extract_pattern_matches(section))

    deduped = _dedupe_certifications(candidates)
    return CertificationExtractionResult(
        certifications=tuple(deduped[:MAX_CERTIFICATIONS]),
    )


def extract_certification_section(full_text: str) -> str:
    """Plain-text certifications block, or empty."""
    return _extract_certification_section(full_text)


def _extract_certification_section(full_text: str) -> str:
    match = _CERTIFICATION_HEADER_RE.search(full_text)
    if not match:
        return ""
    chunk = full_text[match.end() : match.end() + 10_000]
    segment = _CERTIFICATION_SECTION_END_RE.split(chunk, maxsplit=1)[0]
    return segment.strip()


def _extract_from_section(section: str) -> list[str]:
    out: list[str] = []
    for line in _iter_section_lines(section):
        cleaned = _clean_cert_line(line)
        if not cleaned or not _is_plausible_cert_line(cleaned):
            continue
        pattern_hits = _extract_pattern_matches(cleaned)
        if pattern_hits:
            out.extend(pattern_hits)
        elif _line_looks_like_certification(cleaned):
            out.append(cleaned)
    return out


def _iter_section_lines(section: str) -> list[str]:
    lines = [
        _strip_list_marker(ln.strip())
        for ln in section.replace("\r", "\n").split("\n")
        if ln.strip()
    ]
    fragments: list[str] = []
    for line in lines:
        if _PLACEHOLDER_RE.search(line):
            continue
        parts = re.split(r"\s*[|•]\s*|\s*;\s*", line)
        for part in parts:
            part = part.strip()
            if part:
                fragments.append(part)
        if "," in line and len(line) > 40:
            for piece in line.split(","):
                piece = piece.strip()
                if piece and piece != line:
                    fragments.append(piece)
    return fragments if fragments else lines


def _strip_list_marker(line: str) -> str:
    return re.sub(
        r"^(?:\[[ xX]?\]|\(?\d{1,2}[.)]\s*|(?:[•·▪▸►‣⁃*]|[–—-])\s*)+",
        "",
        line,
    ).strip()


def _extract_pattern_matches(text: str) -> list[str]:
    found: list[str] = []
    for pattern in _CERT_PATTERNS:
        for match in pattern.finditer(text):
            label = _label_from_match(match)
            if label:
                found.append(label)
    return found


def _label_from_match(match: re.Match[str]) -> str | None:
    if match.lastindex and match.lastindex >= 2:
        vendor = match.group(1)
        role = match.group(2)
        if vendor and role:
            return _clean_cert_label(f"{vendor} Certified {role}")
    return _clean_cert_label(match.group(0))


def _clean_cert_line(line: str) -> str | None:
    t = line.strip()
    if not t or _LINE_NOISE_RE.search(t):
        return None
    t = _PAREN_METADATA_RE.sub(" ", t)
    t = _TRAILING_PAREN_YEAR_RE.sub("", t)
    t = _DATE_SUFFIX_RE.sub("", t)
    t = re.sub(r"\s+", " ", t).strip(" ,.;|-")
    return _clean_cert_label(t)


def _clean_cert_label(raw: str | None) -> str | None:
    if raw is None:
        return None
    t = raw.strip()
    t = t.replace("\u2013", "-").replace("\u2014", "-")
    t = re.sub(r"\s+", " ", t)
    t = t.strip(" ,.;|-")
    if not t:
        return None
    if len(t) > MAX_CERT_LEN:
        t = t[:MAX_CERT_LEN].strip()
    return t


def _line_looks_like_certification(line: str) -> bool:
    lower = line.lower()
    if _PLACEHOLDER_RE.search(line):
        return False
    if len(line) < 6:
        return False
    if re.fullmatch(r"(?:19|20)\d{2}", line.strip()):
        return False
    keywords = (
        "certified",
        "certification",
        "associate",
        "professional",
        "fundamentals",
        "architect",
        "developer",
        "administrator",
        "engineer",
        "specialist",
        "practitioner",
        "cloud",
        "aws",
        "azure",
        "google",
        "comptia",
        "cisco",
        "kubernetes",
        "terraform",
        "scrum",
        "pmp",
        "itil",
        "cissp",
    )
    return any(kw in lower for kw in keywords)


def _is_plausible_cert_line(line: str) -> bool:
    if len(line) < 4:
        return False
    if not re.search(r"[A-Za-z]", line):
        return False
    if _PLACEHOLDER_RE.search(line):
        return False
    if re.search(r"https?://|linkedin\.com|github\.com", line, re.IGNORECASE):
        return False
    return True


def _dedupe_certifications(candidates: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in candidates:
        label = _clean_cert_label(raw)
        if not label or not _is_plausible_cert_line(label):
            continue
        key = _normalize_dedupe_key(label)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(label)

    # Drop shorter labels subsumed by a longer certification on the same resume.
    out: list[str] = []
    for label in cleaned:
        lower = label.lower()
        if any(
            lower != other.lower()
            and lower in other.lower()
            and len(other) > len(label) + 4
            for other in cleaned
        ):
            continue
        out.append(label)
    return out


def _normalize_dedupe_key(label: str) -> str:
    t = label.lower()
    t = re.sub(r"\s*[-–—]\s*(associate|professional)\s*$", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip()
    return t
