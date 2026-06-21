"""
Canonical skill taxonomy and aliases.

Keep in sync with `app/src/lib/skill-normalizer.ts` in the Next.js ATS for consistent matching.
"""

from __future__ import annotations

# lookup key (lowercase, spaced or compact) → canonical token
SKILL_ALIASES: dict[str, str] = {
    # JavaScript ecosystem
    "react": "react",
    "react.js": "react",
    "reactjs": "react",
    "react js": "react",
    "node": "nodejs",
    "node.js": "nodejs",
    "nodejs": "nodejs",
    "node js": "nodejs",
    "typescript": "typescript",
    "type script": "typescript",
    "ts": "typescript",
    "javascript": "javascript",
    "java script": "javascript",
    "js": "javascript",
    "nextjs": "nextjs",
    "next.js": "nextjs",
    "next js": "nextjs",
    "vue": "vue",
    "vue.js": "vue",
    "vuejs": "vue",
    "angular": "angular",
    "angularjs": "angularjs",
    "svelte": "svelte",
    # Languages & runtimes
    "python": "python",
    "java": "java",
    "kotlin": "kotlin",
    "golang": "go",
    "go": "go",
    "rust": "rust",
    "csharp": "csharp",
    "c#": "csharp",
    "c sharp": "csharp",
    "cpp": "cpp",
    "c++": "cpp",
    # Data & backend
    "postgresql": "postgresql",
    "postgres": "postgresql",
    "psql": "postgresql",
    "mysql": "mysql",
    "mongodb": "mongodb",
    "mongo": "mongodb",
    "redis": "redis",
    "graphql": "graphql",
    "graph ql": "graphql",
    "rest": "rest",
    "rest api": "rest",
    "api": "rest",
    # Cloud & DevOps
    "aws": "aws",
    "amazon web services": "aws",
    "azure": "azure",
    "gcp": "gcp",
    "google cloud": "gcp",
    "docker": "docker",
    "kubernetes": "kubernetes",
    "k8s": "kubernetes",
    "terraform": "terraform",
    "cicd": "cicd",
    "ci/cd": "cicd",
    "ci cd": "cicd",
    # Practices & tools
    "agile": "agile",
    "scrum": "scrum",
    "git": "git",
    "github": "github",
    "gitlab": "gitlab",
    "linux": "linux",
    "unix": "linux",
    "bash": "bash",
    "shell": "bash",
    "fastapi": "fastapi",
    "django": "django",
    "flask": "flask",
    "spring": "spring",
    "spring boot": "springboot",
    "springboot": "springboot",
    "express": "express",
    "expressjs": "express",
    "express.js": "express",
    "tailwind": "tailwindcss",
    "tailwind css": "tailwindcss",
    "tailwindcss": "tailwindcss",
    "sass": "sass",
    "scss": "sass",
    "webpack": "webpack",
    "vite": "vite",
    "jest": "jest",
    "pytest": "pytest",
    "pandas": "pandas",
    "numpy": "numpy",
    "pytorch": "pytorch",
    "tensorflow": "tensorflow",
    "scikit-learn": "sklearn",
    "sklearn": "sklearn",
    "machine learning": "machinelearning",
    "machinelearning": "machinelearning",
    "ml": "machinelearning",
    "nlp": "nlp",
    "openai": "openai",
    "llm": "llm",
    "figma": "figma",
    "jira": "jira",
    "confluence": "confluence",
    "sql": "sql",
    "nosql": "nosql",
    "elasticsearch": "elasticsearch",
    "kafka": "kafka",
    "rabbitmq": "rabbitmq",
    "nginx": "nginx",
    "apache": "apache",
    "html": "html",
    "css": "css",
    "html5": "html",
    "css3": "css",
    "swift": "swift",
    "objective-c": "objectivec",
    "objectivec": "objectivec",
    "php": "php",
    "ruby": "ruby",
    "rails": "rails",
    "ruby on rails": "rails",
    "dotnet": "dotnet",
    ".net": "dotnet",
    "asp.net": "dotnet",
}

CANONICAL_SKILLS: frozenset[str] = frozenset(SKILL_ALIASES.values())


def all_alias_phrases() -> list[tuple[str, str]]:
    """Distinct match phrases (longest first) with canonical target."""
    seen: set[str] = set()
    pairs: list[tuple[str, str]] = []
    for alias, canonical in SKILL_ALIASES.items():
        phrase = alias.strip().lower()
        if not phrase or phrase in seen:
            continue
        seen.add(phrase)
        pairs.append((phrase, canonical))
    pairs.sort(key=lambda p: len(p[0]), reverse=True)
    return pairs
