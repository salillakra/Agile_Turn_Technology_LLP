"""Request/response schemas for POST /parse-resume/llm (Gemini structured parse)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkExperience(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    company: str
    title: str
    start_date: Optional[str] = Field(None, alias="startDate")
    end_date: Optional[str] = Field(None, alias="endDate")
    ongoing: bool = False
    description: Optional[str] = None


class LlmEducationEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    degree: Optional[str] = None
    institution: Optional[str] = None
    graduation_year: Optional[str] = Field(None, alias="graduationYear")
    start_date: Optional[str] = Field(None, alias="startDate")
    end_date: Optional[str] = Field(None, alias="endDate")


class ParsedResumeSchema(BaseModel):
    """Structured output from Gemini tool/schema-enforced parse."""

    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    skills: list[str] = Field(default_factory=list)
    normalized_skills: list[str] = Field(default_factory=list, alias="normalizedSkills")
    work_experience: list[WorkExperience] = Field(default_factory=list, alias="workExperience")
    education: list[LlmEducationEntry] = Field(default_factory=list)
    seniority_estimate: Optional[str] = Field(None, alias="seniorityEstimate")
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class ParseResumeLlmRequest(BaseModel):
    """Plain-text resume body for LLM parse (stateless)."""

    model_config = ConfigDict(populate_by_name=True)

    text: str = Field(..., min_length=1, max_length=50_000)


class ParseResumeLlmResponse(ParsedResumeSchema):
    """LLM parse response — same fields as ParsedResumeSchema."""

    model_config = ConfigDict(populate_by_name=True)


def education_entry_to_dict(entry: LlmEducationEntry) -> dict[str, Any]:
    """Map LLM education row to a JSON-serializable dict (camelCase keys)."""
    return entry.model_dump(by_alias=True, exclude_none=True)
