"""Gemini LLM resume parser — schema-enforced structured extraction."""

from __future__ import annotations

import json
import logging
import re

from google import genai
from google.genai import types

from app.config import get_settings
from app.models.llm_parse_resume import ParsedResumeSchema

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a resume parsing engine. You extract structured candidate data from raw resume text and return it strictly according to the provided schema. You do not invent information. If a field is not present in the text, return null or an empty list — never guess or fabricate.

Rules:
- Dates: normalize to YYYY-MM format where possible. If only a year is given, use YYYY. If "Present" or "Current" appears, set end_date to null and mark ongoing as true.
- Skills: extract both as literally written (skills[]) and as normalized/canonicalized terms (normalized_skills[]) — e.g. "ReactJS" and "React.js" both normalize to "React".
- Seniority: estimate only from explicit signals (years of experience stated, job titles like "Senior", "Staff", "Lead", "Intern") — do not infer from company prestige or project complexity alone.
- Work experience: preserve original job titles and company names verbatim; do not paraphrase.
- If the resume is not in English or is unparseable/garbled, set confidence to 0 and return empty arrays for structured fields, but still attempt name/email extraction if present.
- Confidence (0.0–1.0): reflect how complete and unambiguous the extraction was, not resume quality.

Return ONLY valid JSON matching the schema. No prose, no explanation."""


def _truncate_text(text: str, max_chars: int) -> str:
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(cleaned) <= max_chars:
        return cleaned
    head = max_chars - 120
    return cleaned[:head] + "\n\n[... truncated for LLM token budget ...]\n\n" + cleaned[-80:]


def _build_client() -> genai.Client:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return genai.Client(api_key=settings.gemini_api_key)


def _parse_json_response(raw: str) -> ParsedResumeSchema:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    data = json.loads(text)
    return ParsedResumeSchema.model_validate(data)


def parse_resume_text_with_gemini(raw_text: str) -> ParsedResumeSchema:
    """
    Call Gemini with JSON schema enforcement and return structured parse.

    Uses a cheap/fast flash model by default; text is truncated to control cost.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    resume_text = _truncate_text(raw_text, settings.llm_resume_max_chars)
    user_prompt = f"Extract structured data from this resume text:\n\n{resume_text}"

    client = _build_client()
    config = types.GenerateContentConfig(
        temperature=0.0,
        response_mime_type="application/json",
        response_schema=ParsedResumeSchema,
        system_instruction=SYSTEM_PROMPT,
    )

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=user_prompt,
            config=config,
        )
    except Exception as exc:
        logger.exception("Gemini generate_content failed")
        raise RuntimeError(f"Gemini LLM request failed: {exc}") from exc

    response_text = getattr(response, "text", None) or ""
    if not response_text.strip():
        raise RuntimeError("Gemini returned empty response")

    try:
        parsed = _parse_json_response(response_text)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Gemini JSON parse failed: %s raw=%s", exc, response_text[:500])
        raise RuntimeError(f"Gemini response is not valid structured JSON: {exc}") from exc

    return parsed
