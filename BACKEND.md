# Backend (Next.js API + Prisma)

Base path: `app/`. Backend is the API routes and Prisma layer inside the same Next.js app.

## API routes

| Method | Path | File | Behavior |
|--------|------|------|----------|
| GET | `/api/health` | `app/app/api/health/route.js` | Uses `prisma.user.count()`; returns `{ ok, database, userCount }` or 500 `{ ok: false, database: "disconnected", error }`. |

- Route handler: `export async function GET()`. Imports `prisma` from `@/lib/prisma`.

## Prisma

- **Schema:** `app/prisma/schema.prisma`.
- **Client:** `app/src/lib/prisma.ts` — singleton via `globalThis` in dev to avoid multiple instances (`app/lib/prisma.js` re-exports for legacy imports).
- **Migrations:** `app/prisma/migrations/` (e.g. `20260312185255_init/migration.sql`, `migration_lock.toml`).

**Datasource:** `provider = "postgresql"`, `url = env("DATABASE_URL")`.

**Enums:** `Role` (admin, recruiter, manager); `JobStatus` (Open, Paused, Closed); `ApplicationStage` (Applied, Screening, Interview, Technical, Final_Round, Offer_Sent, Hired, Rejected).

**Models (table names in `@@map`):**

- `User` → `users` — id, email, password, name, role, createdAt, updatedAt; relations: notes, activityLogs.
- `Job` → `jobs` — id, title, department, location, openings, salary, status, postedDate, createdAt, updatedAt; relations: applications.
- `Candidate` → `candidates` — id, candidateName, email, contactNumber, createdAt, updatedAt; relations: applications, notes, candidateTags, activityLogs.
- `Application` → `applications` — id, candidateId, jobId, stage, source, rating, notes, appliedDate, lastActivity, createdAt, updatedAt; unique (candidateId, jobId); relations: candidate, job, activityLogs.
- `Tag` → `tags` — id, name, createdAt; relations: candidateTags.
- `CandidateTag` → `candidate_tags` — id, candidateId, tagId, createdAt; unique (candidateId, tagId); relations: candidate, tag.
- `Note` → `notes` — id, candidateId, authorId, content, createdAt, updatedAt; relations: candidate, author.
- `ActivityLog` → `activity_logs` — id, applicationId, candidateId, userId, action, details, createdAt; relations: application, candidate, user.

## Environment

- `app/.env` — must define `DATABASE_URL` (PostgreSQL). Copy from legacy `backend/.env` if reusing same DB.

## Scripts (app/package.json)

- `npm run prisma:generate` — generate Prisma client.
- `npm run prisma:migrate` — run `prisma migrate dev`.
- `npm run prisma:studio` — open Prisma Studio.

## References (exact paths)

- `app/app/api/health/route.js` — only API route implemented.
- `app/src/lib/prisma.ts` — Prisma client singleton.
- `app/prisma/schema.prisma` — full schema and enums.
