from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.embedding_model import get_embedding_model
from app.similarity import cosine_similarity_score

router = APIRouter(tags=["similarity"])


class SimilarityRequest(BaseModel):
    text1: str = Field(..., description="First text to compare")
    text2: str = Field(..., description="Second text to compare")


class SimilarityResponse(BaseModel):
    similarity: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Cosine similarity between text1 and text2 (0 = unrelated, 1 = identical direction)",
    )


def _require_non_empty(value: str, field_name: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a non-empty string",
        )
    return trimmed


@router.post(
    "/similarity",
    response_model=SimilarityResponse,
    summary="Cosine similarity between two texts",
)
def similarity(body: SimilarityRequest) -> SimilarityResponse:
    """
    Encode both texts with the cached Sentence Transformer, then return cosine similarity in [0, 1].
    """
    text1 = _require_non_empty(body.text1, "text1")
    text2 = _require_non_empty(body.text2, "text2")

    model = get_embedding_model()
    vectors = model.encode(
        [text1, text2],
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    score = cosine_similarity_score(vectors[0], vectors[1])
    return SimilarityResponse(similarity=round(score, 6))
