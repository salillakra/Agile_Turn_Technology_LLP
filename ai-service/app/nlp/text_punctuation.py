"""Terminal punctuation helpers for resume prose fields."""

from __future__ import annotations

import re

_TERMINAL_RE = re.compile(r'[.!?…]["\')\]]*$')


def ensure_full_stop(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "")).strip()
    if not t:
        return t
    if _TERMINAL_RE.search(t):
        return t
    return f"{t}."


def truncate_summary_with_full_stop(text: str, max_len: int) -> str:
    t = re.sub(r"\s+", " ", (text or "")).strip()
    if not t:
        return t
    if len(t) <= max_len:
        return ensure_full_stop(t)
    cut = t[: max_len].rsplit(" ", 1)[0].rstrip(",;:-–—")
    if not cut:
        cut = t[:max_len].strip()
    return ensure_full_stop(cut)
