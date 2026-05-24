# Protecting Private Pages with Server Sessions

This doc explains how to protect routes using the server session and how to restrict by role. All checks run on the server (Server Components or Route Handlers).

---

## 1. Using `getServerSession` to check if a user is logged in

NextAuth’s `getServerSession(authOptions)` reads the session from the request (cookie), verifies the JWT, and returns the session object or `null`. Use it in **Server Components**, **Route Handlers**, or **server actions** (not in Client Components).

This project wraps it in `getSession()` so you don’t pass `authOptions` every time:

```ts
// src/lib/auth.ts
import { getServerSession } from "next-auth";

export async function getSession() {
  return getServerSession(authOptions);
}
```

**Example: layout that requires login**

```tsx
// app/(dashboard)/layout.js
import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";

export default async function DashboardLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <div>{children}</div>;
}
```

- `getSession()` runs on the server for each request to the layout.
- If there is no session (no cookie or invalid/expired JWT), the user is not logged in → redirect.
- If there is a session, the layout renders and all nested routes (`/dashboard`, `/jobs`, `/applicants`, etc.) are protected.

**Example: single page**

```tsx
// app/some-page/page.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";

export default async function SomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <div>Hello, {session.user.email}</div>;
}
```

---

## 2. Redirecting unauthenticated users to `/login`

Use Next.js `redirect()` from `next/navigation` in Server Components or Route Handlers:

```ts
import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";

export default async function ProtectedPage() {
  const session = await getSession();
  if (!session) redirect("/login");  // or redirect("/auth/signin") if you use that path
  // ...
}
```

- `redirect()` throws so nothing after it runs; the response is a 307 to the given path.
- The login page URL is up to you; this project uses `/login` in the dashboard layout. NextAuth’s `pages.signIn` is set to `/auth/signin` for the sign-in form.

---

## 3. Restricting pages based on user roles

The session includes `session.user.role` (e.g. `"ADMIN"`, `"RECRUITER"`, `"HIRING_MANAGER"`). Use it after ensuring the user is logged in.

**Option A: Inline check in a page/layout**

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";

export default async function AdminOnlyPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/unauthorized");
  return <div>Admin content</div>;
}
```

**Option B: Helper `requireAuth(allowedRoles)`**

In `src/lib/auth.ts` we export `requireAuth(allowedRoles)`:

- No session → redirect to `/login`.
- Session exists but `session.user.role` is not in `allowedRoles` → redirect to `/unauthorized`.
- Otherwise returns the session (so you can pass user/role to children).

**Example: only ADMIN and RECRUITER**

```tsx
// app/(dashboard)/jobs/page.tsx (or a layout that wraps only certain routes)
import { requireAuth } from "@/src/lib/auth";

export default async function JobsPage() {
  const session = await requireAuth(["ADMIN", "RECRUITER"]);
  return <div>Jobs (role: {session.user.role})</div>;
}
```

**Example: ADMIN-only page**

```tsx
export default async function AdminSettingsPage() {
  const session = await requireAuth(["ADMIN"]);
  return <div>Settings for {session.user.email}</div>;
}
```

**Example: any logged-in user (no role filter)**

```tsx
const session = await requireAuth();
// same as getSession() but redirects to /login if null
```

---

## 4. Example protected pages: `/dashboard`, `/jobs`, `/candidates` (applicants)

All of these live under the `(dashboard)` group, so they are protected by the **layout** in `app/(dashboard)/layout.js`:

```js
// app/(dashboard)/layout.js
import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function DashboardLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <div style={{ ... }}>
      <Sidebar ... />
      <main>{children}</main>
    </div>
  );
}
```

- **`/dashboard`** – `app/(dashboard)/dashboard/page.js` → protected by layout; no extra role check.
- **`/jobs`** – `app/(dashboard)/jobs/page.js` → protected by layout; add `requireAuth(["ADMIN", "RECRUITER"])` in the page if only certain roles should see it.
- **`/applicants`** (candidates) – `app/(dashboard)/applicants/page.js` → protected by layout; same idea for role restriction.

So:

1. **Login check:** `getSession()` in the dashboard layout; redirect to `/login` if no session.
2. **Role restriction:** In any page that should be role-specific, call `requireAuth(["ADMIN", "RECRUITER"])` (or whatever roles you allow) so unauthorized roles are sent to `/unauthorized`.

You still need to add a **`/login`** (and optionally **`/unauthorized`**) page; this doc only covers the server-side protection logic.
