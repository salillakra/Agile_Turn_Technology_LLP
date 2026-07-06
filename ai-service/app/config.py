from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment / `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "recruitment-ai-service"
    app_version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    embedding_model_name: str = "all-MiniLM-L6-v2"

    # Resume NLP (spaCy) — loaded once at startup when enabled.
    spacy_model_name: str = "en_core_web_sm"
    resume_nlp_enabled: bool = True

    # Optional sandbox for POST /parse-resume `filePath` (must resolve under this directory).
    resume_files_base_path: str | None = None

    # Future: shared secret for service-to-service calls from Next.js BFF/API routes.
    service_api_key: str | None = None

    # Gemini LLM resume parse (POST /parse-resume/llm)
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    llm_resume_max_chars: int = 14_000
    llm_resume_timeout_sec: float = 45.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
