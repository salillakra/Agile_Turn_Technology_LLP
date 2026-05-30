/**
 * Canonical skill tokens for job–candidate matching.
 *
 * Use `normalizeSkills()` when persisting `Candidate.normalizedSkills` or
 * normalizing `Job.requiredSkills` / `Job.preferredSkills` before comparison.
 */

/** Maps lookup keys (spaced or compact) → canonical token. */
const SKILL_ALIASES: Readonly<Record<string, string>> = {
  // JavaScript ecosystem
  react: "react",
  "react.js": "react",
  reactjs: "react",
  "react js": "react",
  node: "nodejs",
  "node.js": "nodejs",
  nodejs: "nodejs",
  "node js": "nodejs",
  typescript: "typescript",
  "type script": "typescript",
  ts: "typescript",
  javascript: "javascript",
  "java script": "javascript",
  js: "javascript",
  nextjs: "nextjs",
  "next.js": "nextjs",
  "next js": "nextjs",
  vue: "vue",
  "vue.js": "vue",
  vuejs: "vue",
  angular: "angular",
  angularjs: "angularjs",
  svelte: "svelte",

  // Languages & runtimes
  python: "python",
  java: "java",
  kotlin: "kotlin",
  golang: "go",
  go: "go",
  rust: "rust",
  csharp: "csharp",
  "c#": "csharp",
  "c sharp": "csharp",
  cpp: "cpp",
  "c++": "cpp",

  // Data & backend
  postgresql: "postgresql",
  postgres: "postgresql",
  psql: "postgresql",
  mysql: "mysql",
  mongodb: "mongodb",
  mongo: "mongodb",
  redis: "redis",
  graphql: "graphql",
  "graph ql": "graphql",
  rest: "rest",
  "rest api": "rest",
  api: "rest",

  // Cloud & DevOps
  aws: "aws",
  "amazon web services": "aws",
  azure: "azure",
  gcp: "gcp",
  "google cloud": "gcp",
  docker: "docker",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
  terraform: "terraform",
  cicd: "cicd",
  "ci/cd": "cicd",
  "ci cd": "cicd",

  // Practices
  agile: "agile",
  scrum: "scrum",
  git: "git",
  github: "github",
  gitlab: "gitlab",
};

/**
 * Build candidate lookup keys for alias resolution (spaced label + compact form).
 */
function toLookupKeys(raw: string): string[] {
  const lower = raw
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-");

  const spaced = lower
    .replace(/[^a-z0-9+#.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withoutJsSuffix = spaced.replace(/\.js$/i, "").trim();
  const compact = spaced.replace(/[\s._-]+/g, "");
  const compactNoJs = withoutJsSuffix.replace(/[\s._-]+/g, "");

  return [...new Set([spaced, withoutJsSuffix, compact, compactNoJs].filter(Boolean))];
}

/**
 * Fallback when no alias matches: lowercase, strip .js/.ts, remove non-alphanumerics.
 */
function defaultCanonical(raw: string): string {
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-");
  s = s.replace(/\.js$/i, "").replace(/\.ts$/i, "");
  s = s.replace(/[^a-z0-9+#]/g, "");
  return s;
}

/**
 * Normalize a single raw skill string to one canonical token.
 *
 * @example normalizeSkill("React.js") // "react"
 * @example normalizeSkill("Node JS") // "nodejs"
 * @example normalizeSkill("Type Script") // "typescript"
 */
export function normalizeSkill(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  for (const key of toLookupKeys(trimmed)) {
    const canonical = SKILL_ALIASES[key];
    if (canonical) return canonical;
  }

  return defaultCanonical(trimmed);
}

/**
 * Normalize a list of raw skills: lowercase/canonicalize, drop empties, dedupe (stable order).
 */
export function normalizeSkills(skills: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of skills ?? []) {
    const canonical = normalizeSkill(raw);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
  }

  return result;
}
