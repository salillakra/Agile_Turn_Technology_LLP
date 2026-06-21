from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

from app.config import get_settings
from app.embedding_model import load_embedding_model
from app.nlp_pipeline import load_nlp_pipeline
from app.routes import embed, health, parse_resume, similarity


@asynccontextmanager
async def lifespan(_application: FastAPI) -> AsyncIterator[None]:
    """Load ML/NLP assets once before serving traffic (per worker process)."""
    settings = get_settings()
    load_embedding_model(settings.embedding_model_name)
    if settings.resume_nlp_enabled:
        load_nlp_pipeline(settings.spacy_model_name)
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Recruitment ATS AI microservice (FastAPI).",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    application.include_router(health.router)
    application.include_router(embed.router)
    application.include_router(parse_resume.router)
    application.include_router(similarity.router)

    return application
