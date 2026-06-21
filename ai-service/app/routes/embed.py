from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.embedding_model import get_embedding_model

router = APIRouter(tags=["embed"])


class EmbedRequest(BaseModel):
    text: str = Field(..., description="Input text to encode into a dense vector")


class EmbedResponse(BaseModel):
    embedding: list[float] = Field(..., description="Dense embedding vector from all-MiniLM-L6-v2")


@router.post("/embed", response_model=EmbedResponse, summary="Generate a text embedding")
def embed(body: EmbedRequest) -> EmbedResponse:
    """
    Encode `text` with the cached Sentence Transformer (all-MiniLM-L6-v2).

    Returns a fixed-size float array suitable for cosine similarity against job/candidate text.
    """
    text = body.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="text must be a non-empty string",
        )

    model = get_embedding_model()
    vector = model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
    return EmbedResponse(embedding=vector.astype(float).tolist())
