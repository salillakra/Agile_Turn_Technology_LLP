"""Canonicalize skill strings (aligned with ATS `skill-normalizer.ts`)."""

from __future__ import annotations

import difflib
import re

from app.nlp.skill_taxonomy import CANONICAL_SKILLS, SKILL_ALIASES

_DASH_NORMALIZE_RE = re.compile(r"[\u2010-\u2015]")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9+#]")


def to_lookup_keys(raw: str) -> list[str]:
    lower = _DASH_NORMALIZE_RE.sub("-", raw.strip().lower())
    spaced = re.sub(r"[^a-z0-9+#.\s-]+", " ", lower)
    spaced = re.sub(r"\s+", " ", spaced).strip()
    without_js = re.sub(r"\.js$", "", spaced, flags=re.IGNORECASE).strip()
    compact = re.sub(r"[\s._-]+", "", spaced)
    compact_no_js = re.sub(r"[\s._-]+", "", without_js)
    keys = [spaced, without_js, compact, compact_no_js]
    out: list[str] = []
    seen: set[str] = set()
    for key in keys:
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def default_canonical(raw: str) -> str:
    s = _DASH_NORMALIZE_RE.sub("-", raw.strip().lower())
    s = re.sub(r"\.js$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\.ts$", "", s, flags=re.IGNORECASE)
    return _NON_ALNUM_RE.sub("", s)


def normalize_skill(raw: str) -> str:
    """
    Map a raw skill label to a canonical token.

    Examples:
        React.js → react
        Node JS → nodejs
    """
    if not isinstance(raw, str):
        return ""
    trimmed = raw.strip()
    if not trimmed:
        return ""

    for key in to_lookup_keys(trimmed):
        canonical = SKILL_ALIASES.get(key)
        if canonical:
            return canonical

    canonical = default_canonical(trimmed)
    if not canonical:
        return ""

    if canonical not in CANONICAL_SKILLS:
        fuzzy = _fuzzy_canonical_match(canonical)
        if fuzzy:
            return fuzzy

    return canonical


def normalize_skills_list(skills: list[str]) -> list[str]:
    """Normalize and dedupe (stable order)."""
    result: list[str] = []
    seen: set[str] = set()
    for raw in skills:
        canonical = normalize_skill(raw)
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        result.append(canonical)
    return result


def _fuzzy_canonical_match(compact: str, *, cutoff: float = 0.88) -> str | None:
    """Semantic-style fallback when alias table misses a close typo."""
    if not compact or len(compact) < 3:
        return None
    candidates = sorted(CANONICAL_SKILLS)
    matches = difflib.get_close_matches(compact, candidates, n=1, cutoff=cutoff)
    return matches[0] if matches else None
