# Authentication and Route Protection

## How route protection works in the Next.js App Router

1. **Layouts wrap all child segments.** The `(dashboard)` route group has a single layout at `app/(dashboard)/layout.js`. That layout runs on the server for every request to `/dashboard`, `/jobs`, `/applicants`, `/kanban`, `/reports`, and any other route under that group. So one layout can enforce auth for all of them.

2. **Server Components and layouts are async.** The dashboard layout is an async function. It calls `requireAuth()` before rendering. `requireAuth()` uses NextAuth’s `getServerSession(authOptions)` to read the session from the request (cookie). No session → it calls Next.js `redirect("/login")`, which throws and sends a 307 to `/login`. So the layout never renders and the user never sees dashboard content.

3. **Role-based redirect.** If you call `requireAuth(allowedRoles)` (e.g. `requireAuth(["ADMIN", "RECRUITER"])`), it first checks for a session (redirect to `/login` if missing), then checks whether `session.user.role` is in `allowedRoles`. If not, it calls `redirect("/unauthorized")`. So “no session” and “wrong role” are handled in one place.

4. **No middleware required.** Protection is done inside the layout (and optionally in pages) by awaiting `requireAuth()`. Middleware could be added later to run checks earlier, but the current pattern is layout-based and works without it.

5. **Client-side navigation.** When the user clicks a link to a protected route, the server runs the layout again, runs `requireAuth()`, and either renders the page or redirects. The redirect is a full navigation (URL changes to `/login` or `/unauthorized`).

---

## Protected routes and how they’re enforced

All of the following are under the `(dashboard)` group, so they are protected by the same layout that calls `requireAuth()`:

| Route you want | App route | File | Protection |
|----------------|-----------|------|------------|
| `/dashboard` | `/dashboard` | `app/(dashboard)/dashboard/page.js` | Layout: `requireAuth()` → no session → `/login` |
| `/jobs` | `/jobs` | `app/(dashboard)/jobs/page.js` | Same layout |
| `/candidates` | `/applicants` | `app/(dashboard)/applicants/page.js` | Same layout (candidates = applicants in this app) |
| `/pipeline` | `/kanban` | `app/(dashboard)/kanban/page.js` | Same layout (pipeline = kanban in this app) |
| `/reports` | `/reports` | `app/(dashboard)/reports/page.js` | Same layout |

- **No session:** `requireAuth()` redirects to **`/login`**.
- **Wrong role:** If a page (or a future layout) calls `requireAuth(["ADMIN"])` (or similar), users without that role are redirected to **`/unauthorized`**. The dashboard layout currently calls `requireAuth()` with no roles, so all logged-in users can access all of the above; add `requireAuth(allowedRoles)` on specific pages or in a nested layout to restrict by role.

---

## Summary

- **Protected routes:** `/dashboard`, `/jobs`, `/applicants` (candidates), `/kanban` (pipeline), `/reports` — all use the `(dashboard)` layout.
- **Layout:** `app/(dashboard)/layout.js` calls `requireAuth()` before rendering. No database logic is changed; protection is session- and role-based only.
- **Behavior:** No session → redirect to `/login`. Wrong role (when `requireAuth(allowedRoles)` is used) → redirect to `/unauthorized`.
