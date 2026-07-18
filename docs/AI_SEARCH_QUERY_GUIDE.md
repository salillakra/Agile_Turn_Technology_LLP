# Agile Turn — AI Candidate Search Query Guide

**Audience:** Recruiters, Hiring Managers, Admins  
**Feature:** Natural-language candidate search (`POST /api/search/candidates`)  
**Last updated:** July 2026

---

## 1. What the search does

When you type a query, Agile Turn:

1. **Understands** skills, years of experience, and location from your text  
2. **Hard-filters** candidates who must match known skills, minimum years, and location (when detected)  
3. **Recalls** matches with two engines:
   - **Semantic** (meaning — “frontend React engineer” ≈ related profiles)
   - **Full-text** (exact words in name, title, skills, summary, company, location)
4. **Fuses** both lists (Reciprocal Rank Fusion), then **re-ranks** by skills, experience, and location fit  

You get a short ranked list with a reason for each match.

---

## 2. How to write a strong query

### Formula that works best

```text
[Role / specialty] + [1–3 known skills] + [years] + [location]
```

**Examples**

| Query | What the system applies |
|--------|-------------------------|
| `React developer Bangalore 5 years` | Must have **react**; ≥ **5** years; location contains **bangalore** |
| `Python AWS remote 3+ years` | Must have **python**, **aws**; ≥ **3** years; **remote** |
| `Node.js TypeScript in Hyderabad` | Must have **nodejs**, **typescript**; location **hyderabad** |
| `Senior Java Spring Boot` | Soft semantic + text search (Spring Boot is not a hard-filter skill alias) |

### Tips

- Prefer **2–4 concrete terms** over long paragraphs.  
- Put **must-have skills** explicitly (React, Python, AWS…).  
- Add **years** when seniority matters (`5 years`, `3+ years`, `minimum 4 years`).  
- Add **location** with `in …`, `based in …`, or `remote` / `hybrid` / `wfh`.  
- Avoid stuffing every nice-to-have into one query — extras become hard must-haves if they are known skills (max 5).

---

## 3. Hard filters vs soft ranking

| Signal | Hard filter? | Effect |
|--------|--------------|--------|
| **Known skills** (alias list) | Yes — candidate must have **all** detected (up to 5) | Wrong-skill profiles are removed |
| **Years of experience** | Yes — `total_experience ≥ N` when a number is detected | Under-experienced profiles removed |
| **Location** | Yes — preferred location must contain the hint | Other cities removed |
| Other words / titles | Soft | Used for semantic + text ranking only |

If results look **too few**, loosen the query (drop a skill, remove years, or drop location).  
If results look **too broad**, add a known skill, years, or `in <city>`.

---

## 4. Experience phrases the system understands

These patterns set a **minimum** years filter:

- `5 years` / `5 yrs`  
- `5+ years`  
- `5 years of experience`  
- `at least 5 years` / `minimum 5 years` / `min 5 years`  

---

## 5. Location phrases

| Phrase | Typical effect |
|--------|----------------|
| `in Bangalore`, `based in Pune`, `located in Mumbai`, `from Delhi` | Location contains that city name |
| `remote`, `wfh`, `work from home`, `hybrid` | Location filter for that work mode |

Location matching is **substring** on the candidate’s preferred work location — keep city names simple.

---

## 6. Known skills (hard-filter aliases)

Only these (and common spellings like `React.js`, `Node JS`, `k8s`) become **hard must-haves**.  
Other skills still help ranking via text/semantic search but are not forced filters.

**Frontend / JS:** react, vue, angular, svelte, nextjs, javascript, typescript, nodejs  

**Languages:** python, java, kotlin, go, rust, csharp, cpp  

**Data / backend:** postgresql, mysql, mongodb, redis, graphql, rest  

**Cloud / DevOps:** aws, azure, gcp, docker, kubernetes, terraform, cicd  

**Practices / tools:** agile, scrum, git, github, gitlab  

Aliases examples: `React.js` → react · `Node JS` → nodejs · `amazon web services` → aws · `k8s` → kubernetes · `C#` → csharp  

---

## 7. Good vs weak queries

### Prefer

```text
React TypeScript Bangalore 4 years
Python data engineer remote 5+ years
Java AWS Docker in Pune minimum 3 years
```

### Avoid

```text
Looking for a really strong full stack person who knows everything and can join ASAP
```

Too vague — few hard signals, weak ranking.

```text
React Vue Angular Node Python Java AWS Azure GCP Docker Kubernetes Terraform
```

Too many hard skills (capped at 5) — almost nobody will match all of them.

---

## 8. How to read results

Each hit includes:

- **Final score** — blend of semantic fit, skill overlap, experience, location  
- **Recommendation reason** — short explanation of why they matched  
- Response may also show parsed **intent** (must-have skills, years, location) so you can verify what filters ran  

If intent looks wrong, rewrite the query with clearer skill / years / location wording.

---

## 9. Privacy & scope

Search only returns candidates in **your data silo** (your owned candidates).  
Admins can search across the full tenant. Assignments do not grant search access to another user’s candidates.

---

## 10. Quick checklist

- [ ] Named 1–3 **known** skills  
- [ ] Added **years** if seniority matters  
- [ ] Added **city** or **remote** if location matters  
- [ ] Kept the sentence short and specific  
- [ ] If empty results → remove one hard constraint and search again  

---

*Agile Turn Technology LLP — Recruitment Suite*  
*Internal guide for AI candidate search*
