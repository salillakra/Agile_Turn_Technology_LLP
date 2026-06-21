"""Cosine similarity helpers for normalized embedding vectors."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def cosine_similarity_score(
    vector_a: NDArray[np.floating],
    vector_b: NDArray[np.floating],
) -> float:
    """
    Cosine similarity for L2-normalized vectors (dot product).

    Clamped to [0, 1] for API consumers. Sentence embeddings are typically non-negative
    cosine pairs; clamping handles numerical edge cases.
    """
    score = float(np.dot(vector_a, vector_b))
    return float(np.clip(score, 0.0, 1.0))
