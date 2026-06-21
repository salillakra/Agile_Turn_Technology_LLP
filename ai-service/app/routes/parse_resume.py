from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.models.parse_resume import ParseResumeRequest, ParseResumeResponse
from app.services.parse_resume import parse_resume_from_path
from app.services.resume_path import ResumePathError

router = APIRouter(tags=["parse-resume"])


def _resume_base_path() -> Path | None:
    raw = get_settings().resume_files_base_path
    if raw is None or not str(raw).strip():
        return None
    return Path(str(raw).strip()).expanduser()


@router.post(
    "/parse-resume",
    response_model=ParseResumeResponse,
    response_model_by_alias=True,
    summary="Extract résumé text and canonical structured parse (schema v10)",
)
def parse_resume(body: ParseResumeRequest) -> ParseResumeResponse:
    """
    Read a PDF résumé from `filePath`, return cleaned plain text and structured fields.

  **Response (camelCase):** `rawText`, `schemaVersion`, `skills`, `normalizedSkills`,
  `companies`, `currentDesignation`, `education`, `certifications`, `totalExperience`,
  `summary`, `skillsConfidence`, `experienceConfidence`, `educationConfidence` (0–1).

    Intended for internal calls from the ATS worker (shared filesystem or configured base path).
    """
    try:
        return parse_resume_from_path(
            body.file_path,
            resume_files_base_path=_resume_base_path(),
        )
    except ResumePathError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in detail.lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read résumé file: {exc}",
        ) from exc
