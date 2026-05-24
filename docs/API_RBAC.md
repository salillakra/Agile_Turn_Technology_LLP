# Server-Side RBAC for API Routes

## How API routes enforce auth and roles

Every protected API route should:

1. **Retrieve the session** using `getSession()` (which uses `getServerSession(authOptions)` under the hood). The session is read from the request (e.g. the NextAuth cookie).
2. **Return 401** if there is no session (user is not logged in).
3. **Check the user’s role** for the requested action (e.g. delete job, create candidate).
4. **Return 403** if the user’s role is not allowed for that action.
5. **Run the action** only when the session exists and the role check passes.

The helper **`requireApiAuth(check)`** in `src/lib/api-auth.ts` does steps 1–4. Use it at the start of each handler:

```ts
const auth = await requireApiAuth(canDeleteJob);  // optional predicate from rbac.ts
if (auth instanceof NextResponse) return auth;     // 401 or 403
const { session } = auth;                          // proceed with session
```

---

## Rules applied

| Action | Allowed roles | RBAC helper |
|--------|----------------|-------------|
| Delete job | ADMIN | `canDeleteJob` |
| Create candidate | RECRUITER, ADMIN | `canCreateCandidate` |
| View candidates / applications | All authenticated | `canViewCandidates` |
| HIRING_MANAGER | View only (no create/edit/delete) | Enforced by not allowing create/edit/delete for other roles |

---

## Routes and methods

| Route | Method | Auth | Role check |
|-------|--------|------|------------|
| `/api/jobs` | GET | Required | View: any |
| `/api/jobs` | DELETE | Required | `canDeleteJob` (ADMIN) |
| `/api/candidates` | GET | Required | `canViewCandidates` (all) |
| `/api/candidates` | POST | Required | `canCreateCandidate` (RECRUITER, ADMIN) |
| `/api/applications` | GET | Required | `canViewCandidates` (all) |
| `/api/applications` | POST | Required | `canCreateCandidate` (RECRUITER, ADMIN) |

---

## Why server-side RBAC improves security vs UI-only checks

1. **UI can be bypassed.** Users can call your API directly (Postman, curl, or by changing front-end code). If you only hide buttons or disable forms by role, a RECRUITER could still send `DELETE /api/jobs` and delete a job if the server did not check the role. Server-side checks guarantee that only allowed roles can perform the action, regardless of how the request is sent.

2. **Single source of truth.** Role rules live in `rbac.ts` and are used both in the UI (to show/hide actions) and in API routes (to allow or deny the request). The server must enforce the same rules as the UI; otherwise the UI is misleading and the API is insecure.

3. **Defence in depth.** Even if the UI is buggy or an attacker tampers with the client, the server still enforces permissions. 403 responses prevent unauthorized state changes and protect data integrity.

4. **Audit and compliance.** Access control is enforced at the API layer, so you can reason about “who can do what” from one place and satisfy requirements that sensitive actions are restricted by role on the server.

**Summary:** UI checks improve UX (don’t show actions the user can’t use). Server-side RBAC is required for security so that only allowed roles can actually perform the action.
