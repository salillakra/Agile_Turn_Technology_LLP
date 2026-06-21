"""Global Sentence Transformer instance — loaded once at startup, reused per request."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

DEFAULT_EMBEDDING_MODEL = "all-MiniLM-L6-v2"

_embedding_model: SentenceTransformer | None = None
_loaded_model_name: str | None = None


def load_embedding_model(model_name: str = DEFAULT_EMBEDDING_MODEL) -> SentenceTransformer:
    """
    Load the embedding model into process memory (idempotent).

    Safe to call from FastAPI startup; subsequent calls return the cached instance
    without reloading weights from disk.
    """
    global _embedding_model, _loaded_model_name

    if _embedding_model is not None:
        if _loaded_model_name != model_name:
            logger.warning(
                "Embedding model already loaded as %r; ignoring request for %r",
                _loaded_model_name,
                model_name,
            )
        return _embedding_model

    from sentence_transformers import SentenceTransformer

    logger.info("Loading Sentence Transformer model: %s", model_name)
    _embedding_model = SentenceTransformer(model_name)
    _loaded_model_name = model_name
    logger.info("Embedding model ready: %s", model_name)
    return _embedding_model


def get_embedding_model() -> SentenceTransformer:
    """Return the cached model. Raises if startup loading has not run."""
    if _embedding_model is None:
        raise RuntimeError(
            "Embedding model is not loaded. Ensure FastAPI lifespan startup completed."
        )
    return _embedding_model


def is_embedding_model_loaded() -> bool:
    return _embedding_model is not None


def clear_embedding_model() -> None:
    """Release cached model (tests / shutdown). Not used on normal request paths."""
    global _embedding_model, _loaded_model_name
    _embedding_model = None
    _loaded_model_name = None
