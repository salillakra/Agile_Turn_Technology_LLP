"""Tests for skill normalization (no spaCy required)."""

from app.nlp.skill_normalizer import normalize_skill, normalize_skills_list


def test_normalize_react_js() -> None:
    assert normalize_skill("React.js") == "react"


def test_normalize_node_js() -> None:
    assert normalize_skill("Node JS") == "nodejs"


def test_normalize_skills_dedupes() -> None:
    assert normalize_skills_list(["React.js", "react", "Node JS"]) == [
        "react",
        "nodejs",
    ]
