"""Global spaCy `Language` pipeline — loaded once at startup, reused per request."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from spacy.language import Language

logger = logging.getLogger(__name__)

DEFAULT_SPACY_MODEL = "en_core_web_sm"

_nlp: Language | None = None
_loaded_model_name: str | None = None


def load_nlp_pipeline(model_name: str = DEFAULT_SPACY_MODEL) -> Language:
    """
    Load the English spaCy model into process memory (idempotent).

    Safe to call from FastAPI lifespan startup; subsequent calls return the cached
    pipeline without reloading weights from disk.
    """
    global _nlp, _loaded_model_name

    if _nlp is not None:
        if _loaded_model_name != model_name:
            logger.warning(
                "spaCy pipeline already loaded as %r; ignoring request for %r",
                _loaded_model_name,
                model_name,
            )
        return _nlp

    import spacy

    logger.info("Loading spaCy NLP pipeline: %s", model_name)
    try:
        _nlp = spacy.load(model_name)
    except OSError as exc:
        raise RuntimeError(
            f"spaCy model {model_name!r} is not installed. "
            f"Run: python -m spacy download {model_name}"
        ) from exc

    _loaded_model_name = model_name
    logger.info(
        "spaCy NLP pipeline ready: %s (pipeline=%s)",
        model_name,
        _nlp.pipe_names,
    )
    return _nlp


def get_nlp_pipeline() -> Language:
    """Return the cached pipeline. Raises if startup loading has not run."""
    if _nlp is None:
        raise RuntimeError(
            "spaCy NLP pipeline is not loaded. Ensure FastAPI lifespan startup completed."
        )
    return _nlp


def is_nlp_pipeline_loaded() -> bool:
    return _nlp is not None


def clear_nlp_pipeline() -> None:
    """Release cached pipeline (tests / shutdown). Not used on normal request paths."""
    global _nlp, _loaded_model_name
    _nlp = None
    _loaded_model_name = None
