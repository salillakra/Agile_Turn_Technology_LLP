"""
Extract technologies/tools from resume plain text.

Uses:
- Custom skill dictionary + normalizer (alias table)
- spaCy PhraseMatcher for multi-word skills
- Section-aware list parsing (SKILLS block)
- Fuzzy canonical matching for near-miss tokens
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.nlp.skill_normalizer import normalize_skill, normalize_skills_list
from app.nlp.skill_taxonomy import all_alias_phrases

logger = logging.getLogger(__name__)

MAX_SKILLS = 50
MAX_SKILL_LEN = 150

# Short aliases only matched in skill sections / lists, not full-document regex.
_SHORT_STANDALONE_ALIASES = frozenset({"js", "ts", "go", "ml", "ai", "api", "rest"})

_SKILLS_SECTION_END = re.compile(
    r"\n(?:\s*)(?=(?:PROFESSIONAL\s+)?(?:EXPERIENCE|(?:WORK|EMPLOYMENT)"
    r"(?:\s+(?:EXPERIENCE|HISTORY))?|EDUCATION|ACADEM(?:IC|ICS)?|PROJECTS?"
    r"|INTERNSHIP|VOLUNTEER|(?:KEY\s+)?ACHIEVEMENTS?|POSITION\s+OF|"
    r"CERTIFICATIONS?|(?:RELEVANT\s+)?COURSEWORK|PUBLICATIONS?|AWARDS?|REFERENCE)\b)",
    re.IGNORECASE,
)

_CATEGORY_PREFIX_RE = re.compile(
    r"^(?:core\s+ai/ml|frameworks/libraries|programming|languages?|tools?|"
    r"backend\s*&\s*deployment|data/visualization|core\s+competencies|"
    r"technical\s+skills?|key\s+skills?)\s+",
    re.IGNORECASE,
)

_PLAUSIBLE_REJECT_RE = re.compile(
    r"https?://|@\S+\.\S+|linkedin\.com|github\.com|"
    r"^(?:st|nd|rd|th)$|"
    r"\b(?:leetcode|gfg|coursera|fest|cultural|comedy|improv|asia|prize|award)\b",
    re.IGNORECASE,
)

@dataclass(frozen=True)
class SkillExtractionResult:
    skills: tuple[str, ...]
    normalized_skills: tuple[str, ...]


def skills_section_candidate_count(full_text: str) -> int:
    """Count skill-like fragments parsed from a dedicated SKILLS section (confidence signal)."""
    return len(_extract_skills_section_candidates(full_text))


def extract_skills_from_text(
    text: str,
    *,
    use_spacy: bool = True,
) -> SkillExtractionResult:
    """
    Detect skills in resume text; return raw surface forms and canonical tokens.

    `skills` — deduped labels as found (or from list segments).
    `normalized_skills` — canonical tokens, deduped (e.g. react, nodejs).
    """
    if not text or not text.strip():
        return SkillExtractionResult(skills=(), normalized_skills=())

    raw_candidates: list[str] = []
    raw_candidates.extend(_extract_skills_section_candidates(text))
    raw_candidates.extend(_extract_comma_line_candidates(text))

    if use_spacy:
        try:
            raw_candidates.extend(_extract_spacy_phrase_matches(text))
        except RuntimeError:
            logger.debug("spaCy pipeline unavailable; dictionary-only skill extraction")
        except Exception as exc:
            logger.warning("spaCy skill phrase match failed: %s", exc)

    raw_candidates.extend(_extract_dictionary_phrase_matches(text))

    raw_skills = _finalize_raw_skills(raw_candidates)
    normalized = tuple(normalize_skills_list(list(raw_skills)))

    return SkillExtractionResult(
        skills=raw_skills,
        normalized_skills=normalized,
    )


def _finalize_raw_skills(candidates: list[str]) -> tuple[str, ...]:
    out: list[str] = []
    seen_lower: set[str] = set()
    seen_canonical: set[str] = set()

    for raw in candidates:
        fragment = _normalize_skill_fragment(raw)
        if not _is_plausible_skill(fragment):
            continue
        key = fragment.lower()
        canonical = normalize_skill(fragment)
        if not canonical:
            continue
        if key in seen_lower or canonical in seen_canonical:
            continue
        seen_lower.add(key)
        seen_canonical.add(canonical)
        out.append(fragment)
        if len(out) >= MAX_SKILLS:
            break

    return tuple(out)


def _normalize_skill_fragment(raw: str) -> str:
    t = _insert_skill_word_boundaries(raw)
    t = re.sub(r"^[-–—•\s]+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = _prefer_compact_skill_surface(t)
    return t[:MAX_SKILL_LEN]


def _prefer_compact_skill_surface(fragment: str) -> str:
    """Type Script → TypeScript when both map to the same canonical skill."""
    collapsed = re.sub(r"\s+", "", fragment)
    if not collapsed or collapsed == fragment:
        return fragment
    if normalize_skill(collapsed) == normalize_skill(fragment) and _is_plausible_skill(collapsed):
        return collapsed
    return fragment


def _insert_skill_word_boundaries(s: str) -> str:
    """Split glued PDF tokens (e.g. MLMachine) — skip plain CamelCase skill names."""
    t = s.strip()
    if not t or " " in t:
        return t
    # Only when lowercase is immediately followed by TitleCase (learningNLP), not TypeScript.
    if not re.search(r"[a-z][A-Z]", t):
        return t
    t = re.sub(r"([A-Z]{2,})(?=[A-Z][a-z])", r"\1 ", t)
    t = re.sub(r"([a-z]{2,})(?=[A-Z][a-z])", r"\1 ", t)
    return re.sub(r"\s+", " ", t).strip()


def _is_plausible_skill(s: str) -> bool:
    t = s.strip()
    if len(t) < 2 or len(t) > MAX_SKILL_LEN:
        return False
    if _PLAUSIBLE_REJECT_RE.search(t):
        return False
    if t.isdigit():
        return False
    if len(t.split()) > 7:
        return False
    if re.search(r"[.!?]", t) and len(t) > 50:
        return False
    return True


def _extract_skills_section_candidates(full_text: str) -> list[str]:
    upper = full_text.upper()
    idx = upper.find("SKILL")
    if idx == -1:
        return []

    chunk = full_text[idx : idx + 12_000]
    after_header = re.sub(r"^[\s\S]*?SKILLS?\s*", "", chunk, count=1, flags=re.IGNORECASE)
    segment = _SKILLS_SECTION_END.split(after_header, maxsplit=1)[0].strip()

    out: list[str] = []
    for fragment in _split_segment_into_skill_fragments(segment):
        if fragment:
            out.append(fragment)
    return out


def _split_segment_into_skill_fragments(segment: str) -> list[str]:
    lines = [
        _strip_leading_list_marker(line.strip())
        for line in segment.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if line.strip()
    ]
    fragments: list[str] = []
    for line in lines:
        fragments.extend(_split_skill_segment(line))
    return fragments


def _strip_leading_list_marker(line: str) -> str:
    return re.sub(
        r"^(?:\[[ xX]?\]|\(?\d{1,2}[.)]\s*|(?:[•·▪▸►‣⁃*]|[–—-])\s*)+",
        "",
        line,
    ).strip()


def _split_skill_segment(segment: str) -> list[str]:
    t = segment.replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(
        r"\s+[\u2022\u2023\u2043\u2219\u25AA\u25CF\u25CB\u25E6\u00B7•·▪▸►‣⁃*]+\s+",
        ", ",
        t,
    )
    parts = re.split(r"[,;\uFF0C\u201A|•·\u2022\u00B7\n\r]+", t)
    out: list[str] = []
    for part in parts:
        cleaned = _CATEGORY_PREFIX_RE.sub("", _insert_skill_word_boundaries(part)).strip()
        if cleaned:
            out.append(cleaned)
    if len(out) == 1 and re.search(r"[,;\uFF0C]", out[0]):
        return [
            _CATEGORY_PREFIX_RE.sub("", p).strip()
            for p in re.split(r"[,;\uFF0C\u201A]+", out[0])
            if p.strip()
        ]
    return out


def _extract_comma_line_candidates(full_text: str) -> list[str]:
    out: list[str] = []
    for line in full_text.replace("\r", "\n").split("\n"):
        if re.search(r"skill", line, re.IGNORECASE) and re.search(r"[,;]", line):
            for part in re.split(r"[,;]", line):
                cleaned = re.sub(r"^.*?:\s*", "", part).strip()
                if cleaned:
                    out.append(cleaned)
    return out


def _is_dictionary_match_false_positive(text: str, phrase: str, start: int) -> bool:
    """Avoid matching `js` inside `React.js` or `ts` inside `.ts`."""
    if start > 0 and text[start - 1] in ".#+":
        return True
    if phrase in ("api", "go", "ml") and start > 0:
        prev = text[start - 1]
        if prev.isalnum() and phrase == "go":
            return True
    return False


def _extract_dictionary_phrase_matches(text: str) -> list[str]:
    """Word-boundary regex scan for dictionary aliases (fallback without spaCy)."""
    lower = text.lower()
    found: list[str] = []
    for phrase, _canonical in all_alias_phrases():
        if len(phrase) < 2 or phrase in _SHORT_STANDALONE_ALIASES:
            continue
        pattern = r"(?<![a-z0-9+#.])" + re.escape(phrase) + r"(?![a-z0-9+#.])"
        for match in re.finditer(pattern, lower):
            start, end = match.span()
            if _is_dictionary_match_false_positive(text, phrase, start):
                continue
            surface = text[start:end].strip()
            if surface and _is_plausible_skill(surface):
                found.append(surface)
    return found


_matcher_vocab_id: int | None = None
_cached_phrase_matcher: object | None = None


def _get_skill_phrase_matcher(nlp: object) -> object:
    """Reuse one PhraseMatcher per process (built after spaCy startup)."""
    global _matcher_vocab_id, _cached_phrase_matcher
    from spacy.matcher import PhraseMatcher

    vocab_id = id(nlp.vocab)  # type: ignore[union-attr]
    if _cached_phrase_matcher is not None and _matcher_vocab_id == vocab_id:
        return _cached_phrase_matcher

    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")  # type: ignore[union-attr]
    patterns = [
        nlp.make_doc(phrase)  # type: ignore[union-attr]
        for phrase, _ in all_alias_phrases()
        if len(phrase) >= 2
    ]
    matcher.add("SKILL", patterns)
    _cached_phrase_matcher = matcher
    _matcher_vocab_id = vocab_id
    return matcher


def _extract_spacy_phrase_matches(text: str) -> list[str]:
    """spaCy PhraseMatcher over custom skill dictionary (multi-word technologies)."""
    from app.nlp_pipeline import get_nlp_pipeline

    nlp = get_nlp_pipeline()
    matcher = _get_skill_phrase_matcher(nlp)

    doc = nlp(text[:100_000])
    found: list[str] = []
    for _match_id, start, end in matcher(doc):
        surface = doc[start:end].text.strip()
        if surface and _is_plausible_skill(surface):
            found.append(surface)
    return found
