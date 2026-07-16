"""
Build a one-line structured resume summary from extracted NLP entities.

Template-driven (no LLM), e.g.:
"Frontend engineer with 4 years experience in React, TypeScript and AWS."
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.parse_resume import ResumeEducationEntry, StructuredResumeParse
from app.nlp.text_punctuation import truncate_summary_with_full_stop

MAX_SUMMARY_LEN = 1200
MAX_HIGHLIGHT_SKILLS = 5

_AT_COMPANY_SUFFIX_RE = re.compile(r"\s+(?:at|@)\s+.+$", re.IGNORECASE)

# Canonical token → display label for summary prose.
_CANONICAL_DISPLAY: dict[str, str] = {
    "react": "React",
    "typescript": "TypeScript",
    "javascript": "JavaScript",
    "nodejs": "Node.js",
    "nextjs": "Next.js",
    "vue": "Vue",
    "angular": "Angular",
    "python": "Python",
    "java": "Java",
    "kotlin": "Kotlin",
    "go": "Go",
    "rust": "Rust",
    "csharp": "C#",
    "cpp": "C++",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "graphql": "GraphQL",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "terraform": "Terraform",
    "django": "Django",
    "flask": "Flask",
    "fastapi": "FastAPI",
    "springboot": "Spring Boot",
    "express": "Express",
    "tailwindcss": "Tailwind CSS",
    "machinelearning": "machine learning",
    "nlp": "NLP",
    "sql": "SQL",
    "html": "HTML",
    "css": "CSS",
    "dotnet": ".NET",
    "figma": "Figma",
    "kafka": "Kafka",
    "elasticsearch": "Elasticsearch",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "pandas": "Pandas",
    "numpy": "NumPy",
}

_LOW_PRIORITY_SKILLS = frozenset(
    {
        "git",
        "github",
        "gitlab",
        "agile",
        "scrum",
        "jira",
        "confluence",
        "linux",
        "bash",
        "rest",
        "api",
        "html",
        "css",
    }
)

_ROLE_FROM_SKILLS: tuple[tuple[frozenset[str], str], ...] = (
    (frozenset({"react", "vue", "angular", "nextjs", "svelte"}), "Frontend engineer"),
    (frozenset({"django", "flask", "fastapi", "springboot", "express"}), "Backend engineer"),
    (frozenset({"kubernetes", "terraform", "docker", "aws", "azure", "gcp"}), "DevOps engineer"),
    (frozenset({"pytorch", "tensorflow", "machinelearning", "pandas", "numpy"}), "Data scientist"),
    (frozenset({"figma", "html", "css"}), "UI engineer"),
)

_CERT_SKILL_HINTS: tuple[tuple[str, str], ...] = (
    ("aws certified", "aws"),
    ("amazon web services", "aws"),
    ("google cloud", "gcp"),
    ("microsoft azure", "azure"),
    ("azure ", "azure"),
    ("kubernetes", "kubernetes"),
    ("terraform", "terraform"),
)


@dataclass(frozen=True)
class ResumeSummaryBuildInput:
    current_designation: str | None
    past_roles: tuple[str, ...]
    total_experience: float
    normalized_skills: tuple[str, ...]
    skills: tuple[str, ...]
    certifications: tuple[str, ...]
    education: tuple[ResumeEducationEntry, ...]


def build_resume_summary_from_structured_parse(data: StructuredResumeParse) -> str:
    """Build structured `summary` from canonical parse fields."""
    return build_resume_summary(
        ResumeSummaryBuildInput(
            current_designation=data.current_designation,
            past_roles=(),
            total_experience=float(data.total_experience),
            normalized_skills=tuple(data.normalized_skills),
            skills=tuple(data.skills),
            certifications=tuple(data.certifications),
            education=tuple(data.education),
        )
    )


# Back-compat alias
build_resume_summary_from_extracted_data = build_resume_summary_from_structured_parse


def build_resume_summary(inputs: ResumeSummaryBuildInput) -> str:
    """Compose a recruiter-facing one-liner from structured parse entities."""
    if inputs.total_experience < 1.0 and inputs.education:
        grad = _graduate_summary(inputs.education)
        if grad:
            return truncate_summary_with_full_stop(grad, MAX_SUMMARY_LEN)

    role = _resolve_role(inputs)
    years_phrase = _format_experience_years(inputs.total_experience)
    highlights = _pick_highlight_labels(inputs)

    parts: list[str] = [role]
    if years_phrase:
        parts.append(years_phrase)
    if highlights:
        parts.append(f"in {_join_list(highlights)}")

    summary = " ".join(parts).strip()
    if not summary.endswith("."):
        summary += "."
    return truncate_summary_with_full_stop(summary, MAX_SUMMARY_LEN)


def _graduate_summary(education: tuple[ResumeEducationEntry, ...]) -> str | None:
    entry = education[0]
    degree = (entry.degree or "").strip()
    if not degree:
        return None
    degree_lower = degree.lower()
    article = "an" if degree_lower[:1] in "aeiou" else "a"
    return f"Recent graduate with {article} {degree}"


def _resolve_role(inputs: ResumeSummaryBuildInput) -> str:
    if inputs.current_designation:
        formatted = _format_role_phrase(inputs.current_designation)
        if formatted:
            return formatted
    if inputs.past_roles:
        formatted = _format_role_phrase(inputs.past_roles[0])
        if formatted:
            return formatted
    inferred = _infer_role_from_skills(inputs.normalized_skills)
    if inferred:
        return inferred
    return "Software professional"


def _format_role_phrase(designation: str) -> str | None:
    t = _AT_COMPANY_SUFFIX_RE.sub("", designation.strip())
    t = re.sub(r"\s+", " ", t).strip(" ,.;|-")
    if len(t) < 3 or len(t) > 80:
        return None
    words = t.split()
    if not words:
        return None
    return words[0] + (" " + " ".join(w.lower() for w in words[1:]) if len(words) > 1 else "")


def _infer_role_from_skills(normalized_skills: tuple[str, ...]) -> str | None:
    skill_set = frozenset(normalized_skills)
    for triggers, label in _ROLE_FROM_SKILLS:
        if skill_set & triggers:
            return label
    return None


def _format_experience_years(years: float) -> str:
    if years <= 0:
        return ""
    if abs(years - round(years)) < 0.05:
        n = int(round(years))
        unit = "year" if n == 1 else "years"
        return f"with {n} {unit} experience"
    rounded = round(years, 1)
    unit = "year" if rounded == 1.0 else "years"
    return f"with {rounded} {unit} experience"


def _pick_highlight_labels(inputs: ResumeSummaryBuildInput) -> list[str]:
    canonicals = list(_expanded_skill_tokens(inputs))
    if not canonicals:
        return []

    raw_by_canonical = _raw_labels_by_canonical(inputs.skills)
    ordered = _sort_skill_priority(canonicals)

    labels: list[str] = []
    seen: set[str] = set()
    for token in ordered:
        if token in seen:
            continue
        label = raw_by_canonical.get(token) or _display_for_canonical(token)
        key = label.lower()
        if key in seen:
            continue
        seen.add(token)
        seen.add(key)
        labels.append(label)
        if len(labels) >= MAX_HIGHLIGHT_SKILLS:
            break
    return labels


def _expanded_skill_tokens(inputs: ResumeSummaryBuildInput) -> list[str]:
    tokens = list(inputs.normalized_skills)
    present = frozenset(tokens)
    for cert in inputs.certifications:
        lower = cert.lower()
        for hint, token in _CERT_SKILL_HINTS:
            if hint in lower and token not in present:
                tokens.append(token)
                present = frozenset(tokens)
    return tokens


def _raw_labels_by_canonical(raw_skills: tuple[str, ...]) -> dict[str, str]:
    from app.nlp.skill_normalizer import normalize_skill

    out: dict[str, str] = {}
    for raw in raw_skills:
        canonical = normalize_skill(raw)
        if not canonical or canonical in out:
            continue
        cleaned = re.sub(r"\s+", " ", raw.strip())
        if 2 <= len(cleaned) <= 40:
            out[canonical] = cleaned
    return out


def _sort_skill_priority(tokens: list[str]) -> list[str]:
    def score(token: str) -> tuple[int, int]:
        low_priority = 1 if token in _LOW_PRIORITY_SKILLS else 0
        return (low_priority, tokens.index(token))

    return sorted(tokens, key=score)


def _display_for_canonical(token: str) -> str:
    if token in _CANONICAL_DISPLAY:
        return _CANONICAL_DISPLAY[token]
    if token.isupper() and len(token) <= 5:
        return token
    if len(token) <= 3:
        return token.upper()
    return token.capitalize()


def _join_list(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f" and {items[-1]}"


