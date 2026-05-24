# Authentication infrastructure setup

## 1. Prisma configuration

Prisma is already configured in this project.

- **Schema:** `prisma/schema.prisma` — PostgreSQL datasource (`env("DATABASE_URL")`), generator `prisma-client-js`.
- **Client:** `src/lib/prisma.ts` — Singleton PrismaClient (dev-safe).
- **User model:** `User` exists with `id`, `email`, `password`, `name`, `role` (enum: admin, recruiter, manager), `createdAt`, `updatedAt`, and relations.

No Prisma changes were made for this setup. Auth will use the existing `User` model and database.

---

## 2. Installed packages

| Package | Version (installed) | Purpose |
|--------|----------------------|--------|
| **next-auth** | ^4.24.13 | Auth runtime for Next.js |
| **@next-auth/prisma-adapter** | ^1.0.7 | Connects NextAuth to Prisma/PostgreSQL |
| **bcrypt** | ^6.0.0 | Password hashing |

---

## 3. Why each package is needed

### next-auth

- Provides the full auth flow: sign-in, sign-out, session handling, and secure cookies.
- Exposes a session provider and hooks (e.g. `useSession`, `getServerSession`) so you can protect routes and read the current user in App Router (server components and Route Handlers).
- Handles CSRF and session storage; works with Next.js middleware for route protection.
- **Without it:** You would have to implement sessions, cookies, and CSRF yourself.

### @next-auth/prisma-adapter

- Tells NextAuth to use **Prisma** (and thus your PostgreSQL database) for auth data.
- The adapter implements the calls NextAuth needs: create/update/find user, create/link account, create/update session, etc., using your Prisma schema.
- It expects Prisma models that match the adapter’s expected names/fields (e.g. `User`, `Account`, `Session`, `VerificationToken`). Your schema already has `User`; when you add auth code, you will add or align the other tables the adapter needs.
- **Without it:** NextAuth would not persist users/sessions in your existing Prisma/PostgreSQL setup; you’d need to wire that by hand.

### bcrypt

- Used to **hash passwords** before storing them in the database (e.g. in `User.password`). You hash on sign-up and when changing a password; you compare the plain password to the hash on sign-in.
- Industry-standard for password hashing (salted, tunable cost).
- **Without it:** You would need another secure hashing library; storing plain or weakly hashed passwords is unsafe.

---

## 4. Next.js App Router verification

This project uses the **App Router**.

- **Routes and UI:** All app routes live under the `app/` directory (e.g. `app/page.js`, `app/(dashboard)/dashboard/page.js`, `app/(dashboard)/jobs/page.js`, etc.). There is no top-level `pages/` directory in the project source.
- **Convention:** Routes are defined by `page.js` (or `page.jsx`) and layout by `layout.js` inside `app/` and its subfolders. API routes use `app/api/.../route.js` (e.g. `app/api/health/route.js`).
- **Implication for auth:** NextAuth will be integrated via the App Router: Route Handlers under `app/api/auth/[...nextauth]/route.js` for the NextAuth API, and session access in Server Components and Route Handlers via `getServerSession` or the NextAuth session callback. No Pages Router (`pages/api` or `pages/*`) is used.

---

## 5. Intended architecture (no code)

- **Database:** PostgreSQL, accessed only through Prisma. Existing `User` model; adapter-related tables (e.g. `Account`, `Session`, `VerificationToken`) will be added when you implement auth.
- **Auth provider:** NextAuth (Credentials or other providers), configured with the Prisma adapter and `bcrypt` for credential verification.
- **API surface:** NextAuth’s API routes mounted at `/api/auth/*` via a single Route Handler in `app/api/auth/[...nextauth]/route.js`.
- **Session:** Stored in the database via the Prisma adapter; session token in an HTTP-only cookie. Read in server components and Route Handlers with `getServerSession`.
- **Passwords:** Hashed with `bcrypt` before saving to `User.password`; compared with `bcrypt.compare` during sign-in.

No authentication code has been added yet; only dependencies and this layout are in place.
