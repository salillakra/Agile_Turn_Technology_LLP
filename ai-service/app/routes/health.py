from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.embedding_model import is_embedding_model_loaded
from app.nlp_pipeline import is_nlp_pipeline_loaded

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — process is up (does not check model load)."""
    return {"status": "ok"}


@router.get("/ready")
def ready() -> dict[str, object]:
    """
    Readiness probe — models required for this process configuration are loaded.

    Use for Kubernetes/load balancers after startup; returns 503 until lifespan completes.
    """
    settings = get_settings()
    checks: dict[str, bool] = {
        "embedding": is_embedding_model_loaded(),
        "nlp": is_nlp_pipeline_loaded() if settings.resume_nlp_enabled else True,
    }

    if not all(checks.values()):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "not_ready", "checks": checks},
        )

    return {
        "status": "ready",
        "checks": checks,
        "embedding_model": settings.embedding_model_name,
        "spacy_model": settings.spacy_model_name if settings.resume_nlp_enabled else None,
    }
