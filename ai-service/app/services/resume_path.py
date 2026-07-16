"""Safe resolution of resume file paths for service-to-service reads."""

from __future__ import annotations

from pathlib import Path

PDF_SUFFIX = ".pdf"


class ResumePathError(ValueError):
    """Invalid or disallowed resume path."""


def resolve_resume_pdf_path(file_path: str, base_dir: Path | None) -> Path:
    """
    Resolve and validate a PDF path.

    - Expands user/home segments.
    - When `base_dir` is set, the resolved path must stay under that directory.
    - File must exist and use a `.pdf` extension.
    """
    raw = file_path.strip()
    if not raw:
        raise ResumePathError("filePath must be a non-empty string")

    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        if base_dir is None:
            raise ResumePathError(
                "filePath must be absolute when RESUME_FILES_BASE_PATH is not configured"
            )
        candidate = (base_dir / candidate).resolve()
    else:
        candidate = candidate.resolve()

    if base_dir is not None:
        base = base_dir.expanduser().resolve()
        try:
            candidate.relative_to(base)
        except ValueError as exc:
            raise ResumePathError(
                f"filePath must be under configured base directory: {base}"
            ) from exc

    if candidate.suffix.lower() != PDF_SUFFIX:
        raise ResumePathError(f"Only {PDF_SUFFIX} files are supported")

    if not candidate.is_file():
        raise ResumePathError(f"resume file not found: {candidate}")

    return candidate
