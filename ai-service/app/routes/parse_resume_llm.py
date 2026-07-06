from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.models.llm_parse_resume import ParseResumeLlmRequest, ParseResumeLlmResponse
from app.services.llm_parse_resume import parse_resume_text_with_gemini

router = APIRouter(tags=["parse-resume-llm"])


@router.post(
    "/parse-resume/llm",
    response_model=ParseResumeLlmResponse,
    response_model_by_alias=True,
    summary="LLM structured resume parse from plain text (Gemini)",
)
def parse_resume_llm(body: ParseResumeLlmRequest) -> ParseResumeLlmResponse:
    """
    Stateless LLM parse — accepts `{ text }`, returns schema-enforced structured fields.

    Requires `GEMINI_API_KEY`. Uses a fast/cheap Gemini flash model by default.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM parse is not configured (GEMINI_API_KEY missing)",
        )

    text = body.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="text must not be empty",
        )

    try:
        parsed = parse_resume_text_with_gemini(text)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return ParseResumeLlmResponse.model_validate(parsed.model_dump())
