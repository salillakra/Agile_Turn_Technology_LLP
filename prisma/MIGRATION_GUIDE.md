# Prisma migration guide (auth / schema sync)

## 1. Run a migration to create authentication tables

**When to run:** After you change `prisma/schema.prisma` (e.g. add or change models).

**From project root** (the folder that contains `prisma/` and `package.json`):

```bash
cd "C:\Users\adity\OneDrive\Desktop\recruitment system\app"
npx prisma migrate dev --name auth
```

- **`migrate dev`** – Creates a new migration from schema changes and applies it to the database (development).
- **`--name auth`** – Names the migration (e.g. `20260313195731_auth`). Use any name that describes the change.

If there are **no pending schema changes**, Prisma will report that the database is already in sync and will not create a new migration.

---

## 2. What tables the auth schema creates

For the current auth-related models in `schema.prisma`, Prisma creates/updates these **PostgreSQL tables**:

| Table | Purpose |
|-------|--------|
| **users** | User identity: id, name, email, email_verified, image, password, role (enum: ADMIN, RECRUITER, HIRING_MANAGER), created_at, updated_at. |
| **accounts** | OAuth: links a user to a provider (e.g. Google). Stores provider, provider_account_id, access_token, refresh_token, expires_at, etc. |
| **sessions** | Server-side sessions: session_token (unique), user_id, expires. Used to validate the session cookie. |
| **verification_tokens** | One-time tokens for email verification or magic-link sign-in: identifier, token, expires (unique on identifier + token). |

The **Role** enum in the DB has values: `ADMIN`, `RECRUITER`, `HIRING_MANAGER`.

Existing tables (e.g. jobs, candidates, applications, notes, activity_logs) are unchanged unless you modify their models in the schema.

---

## 3. Verify the database schema is synced

**Check migration status:**

```bash
npx prisma migrate status
```

- **“Database schema is up to date!”** – All migrations are applied; schema and DB match.
- **“X migration(s) pending”** – Run `npx prisma migrate dev --name <name>` to create and apply them.

**Inspect tables (optional):**

```bash
npx prisma studio
```

Opens a UI at http://localhost:5555 where you can browse tables and rows.

**Regenerate the client after schema/migration changes:**

```bash
npx prisma generate
```

Usually run automatically by `migrate dev`; run manually if you only changed the schema and did not use `migrate dev`.

---

## Summary

| Step | Command |
|------|--------|
| Run migration (create + apply) | `npx prisma migrate dev --name auth` |
| Verify schema in sync | `npx prisma migrate status` |
| Open DB in browser | `npx prisma studio` |
| Regenerate client | `npx prisma generate` |

Always run these from the **app** project root (where `prisma/schema.prisma` lives).
