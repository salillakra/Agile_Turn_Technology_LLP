function normalizeSkill(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9+.#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAlphaNum(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, "");
}

function tokens(s: string): string[] {
  const t = normalizeSkill(s);
  return t.split(" ").filter(Boolean);
}

function isSkillMatch(requiredRaw: string, candidateRaw: string): boolean {
  const r = normalizeSkill(requiredRaw);
  const c = normalizeSkill(candidateRaw);
  if (!r || !c) return false;

  // Exact normalized match (fast path).
  if (r === c) return true;

  // Compare alphanumeric-only variants to handle "Node.js" vs "NodeJS", "React.js" vs "ReactJS", etc.
  const ra = normalizeAlphaNum(r);
  const ca = normalizeAlphaNum(c);
  if (ra && ca && ra === ca) return true;

  // Token subset match: all required tokens must appear in candidate tokens.
  // Example: required "react" matches candidate "react js".
  const rt = tokens(r);
  const ct = new Set(tokens(c));
  if (rt.length > 0 && rt.every((x) => ct.has(x))) return true;

  // Containment check on compact forms (guards against punctuation differences).
  // Example: required "react" vs candidate "reactjs".
  if (ra && ca && (ca.includes(ra) || ra.includes(ca))) return true;

  return false;
}

export function computeSkillMatchPercent(params: {
  requiredSkills: string[];
  candidateSkills: string[];
}): { matched: number; required: number; percent: number } {
  const required = (params.requiredSkills ?? [])
    .map((s) => (typeof s === "string" ? normalizeSkill(s) : ""))
    .filter(Boolean);
  const candidate = (params.candidateSkills ?? [])
    .map((s) => (typeof s === "string" ? s : ""))
    .filter((s) => s.trim().length > 0);

  if (required.length === 0) {
    return { matched: 0, required: 0, percent: 100 };
  }

  let matched = 0;
  for (const r of required) {
    if (candidate.some((c) => isSkillMatch(r, c))) matched += 1;
  }
  const percent = Math.round((matched / required.length) * 1000) / 10; // 1 decimal
  return { matched, required: required.length, percent };
}

