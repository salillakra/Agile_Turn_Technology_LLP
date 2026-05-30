export type RecruiterSearchSuggestion = {
  /** Full query text sent to semantic search. */
  text: string;
  /** Short label for chips / list (defaults to text). */
  label?: string;
  /** Grouping in autocomplete UI. */
  category: "role" | "skill" | "stack" | "experience" | "location";
  /** Extra tokens for fuzzy matching. */
  keywords: string[];
};

/** Curated guided prompts (template-based; not LLM-generated). */
export const RECRUITER_SEARCH_SUGGESTIONS: readonly RecruiterSearchSuggestion[] = [
  {
    text: "Find React developers",
    category: "skill",
    keywords: ["react", "frontend", "javascript", "ui"],
  },
  {
    text: "Find data analysts",
    category: "role",
    keywords: ["data", "analyst", "analytics", "sql", "bi"],
  },
  {
    text: "Find AWS engineers",
    category: "stack",
    keywords: ["aws", "amazon", "cloud", "devops", "infrastructure"],
  },
  {
    text: "Find backend engineers with Node.js and AWS",
    category: "stack",
    keywords: ["backend", "node", "nodejs", "aws", "api"],
  },
  {
    text: "Frontend developers with React",
    category: "skill",
    keywords: ["frontend", "react", "javascript", "css"],
  },
  {
    text: "Find Python developers with 5+ years experience",
    category: "experience",
    keywords: ["python", "senior", "years", "backend"],
  },
  {
    text: "Find TypeScript engineers",
    category: "skill",
    keywords: ["typescript", "ts", "javascript", "frontend"],
  },
  {
    text: "Find Java developers",
    category: "skill",
    keywords: ["java", "spring", "backend", "jvm"],
  },
  {
    text: "Find DevOps engineers with Kubernetes",
    category: "stack",
    keywords: ["devops", "kubernetes", "k8s", "docker", "cicd"],
  },
  {
    text: "Find machine learning engineers",
    category: "role",
    keywords: ["ml", "machine learning", "ai", "data science", "python"],
  },
  {
    text: "Find product managers with SaaS experience",
    category: "role",
    keywords: ["product", "pm", "saas", "b2b"],
  },
  {
    text: "Find QA engineers with automation",
    category: "role",
    keywords: ["qa", "quality", "selenium", "test", "automation"],
  },
  {
    text: "Find remote full-stack developers",
    category: "location",
    keywords: ["remote", "fullstack", "full stack", "wfh"],
  },
  {
    text: "Find engineers in Bangalore",
    category: "location",
    keywords: ["bangalore", "bengaluru", "india", "location"],
  },
  {
    text: "Find .NET developers",
    category: "skill",
    keywords: ["dotnet", "c#", "csharp", "microsoft"],
  },
  {
    text: "Find mobile developers with React Native",
    category: "stack",
    keywords: ["mobile", "react native", "ios", "android"],
  },
];

const CATEGORY_LABELS: Record<RecruiterSearchSuggestion["category"], string> = {
  role: "Role",
  skill: "Skill",
  stack: "Stack",
  experience: "Experience",
  location: "Location",
};

export function recruiterSearchSuggestionCategoryLabel(
  category: RecruiterSearchSuggestion["category"]
): string {
  return CATEGORY_LABELS[category] ?? "Search";
}

function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ");
}

function scoreSuggestion(suggestion: RecruiterSearchSuggestion, normalizedPrefix: string): number {
  if (!normalizedPrefix) return 0;

  const text = normalizeForMatch(suggestion.text);
  if (text === normalizedPrefix) return 1000;
  if (text.startsWith(normalizedPrefix)) return 900 - (text.length - normalizedPrefix.length);

  const tokens = normalizedPrefix.split(" ").filter(Boolean);
  const haystack = `${text} ${suggestion.keywords.join(" ")}`;

  let score = 0;
  for (const token of tokens) {
    if (text.startsWith(token)) score += 200;
    else if (text.includes(token)) score += 120;
    else if (haystack.includes(token)) score += 80;
  }

  if (haystack.includes(normalizedPrefix)) score += 150;
  return score;
}

/**
 * Filter and rank autocomplete suggestions for a typed prefix.
 * Empty prefix returns featured starters (includes React / data analysts / AWS examples).
 */
export function filterRecruiterSearchSuggestions(
  prefix: string,
  options: { limit?: number } = {}
): RecruiterSearchSuggestion[] {
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
  const normalized = normalizeForMatch(prefix);

  if (!normalized) {
    return RECRUITER_SEARCH_SUGGESTIONS.slice(0, limit).map((s) => ({
      ...s,
      label: s.label ?? s.text,
    }));
  }

  const scored = RECRUITER_SEARCH_SUGGESTIONS.map((suggestion) => ({
    suggestion,
    score: scoreSuggestion(suggestion, normalized),
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.suggestion.text.localeCompare(b.suggestion.text);
    });

  return scored.slice(0, limit).map((row) => ({
    ...row.suggestion,
    label: row.suggestion.label ?? row.suggestion.text,
  }));
}
