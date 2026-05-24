# NextAuth Credentials Login Flow (Backend)

This document describes how login works with the Credentials provider: verification, password comparison with bcrypt, and session creation. No UI is involved; the flow is triggered when the client sends credentials to NextAuth’s sign-in endpoint.

---

## 1. How the Credentials Provider Verifies the User

The Credentials provider is configured in `src/lib/auth.ts`. When a client calls the NextAuth sign-in API (e.g. `signIn("credentials", { email, password })`), NextAuth:

1. **Receives credentials**  
   The client sends `email` and `password` in the request body to `/api/auth/callback/credentials` (or equivalent sign-in flow).

2. **Calls `authorize(credentials)`**  
   NextAuth invokes the `authorize` function you passed to `CredentialsProvider`. It receives an object like `{ email, password }`.

3. **Validation**  
   - If `credentials?.email` or `credentials?.password` is missing, `authorize` returns `null`. NextAuth treats that as failed sign-in and returns an error.
   - If both are present, the function continues.

4. **Look up the user**  
   The code runs:
   ```ts
   const user = await prisma.user.findUnique({ where: { email: credentials.email } });
   ```
   - If no user exists for that email, or the user has no `password` (e.g. OAuth-only user), `authorize` returns `null` → login fails.

5. **Password check**  
   The code runs:
   ```ts
   const valid = await bcrypt.compare(credentials.password, user.password);
   if (!valid) return null;
   ```
   - `credentials.password` is the **plain text** from the request.
   - `user.password` is the **stored hash** from the database (from registration).
   - If the comparison fails, `authorize` returns `null` → login fails.

6. **Success**  
   If the comparison succeeds, `authorize` returns a **user object** (without the password):
   ```ts
   return { id: user.id, email: user.email, name: user.name, image: user.image ?? undefined, role: user.role };
   ```
   NextAuth then uses this object to build the JWT and session (see section 3).

**Summary:** The Credentials provider verifies the user by (1) finding the user by email in the DB, (2) comparing the submitted password to the stored hash with bcrypt, and (3) returning the user object only when both steps succeed; otherwise it returns `null` and login fails.

---

## 2. How Passwords Are Compared Using bcrypt

- **Stored value:** In the database we never store the raw password. At registration, we hashed it with `bcrypt.hash(password, saltRounds)` and stored the resulting string in `user.password`. That string includes the salt and the hash.

- **At login:** We do **not** “decrypt” the password. We only compare:
  ```ts
  bcrypt.compare(plainTextPassword, storedHash)
  ```
  - **First argument:** The plain-text password from the login request.
  - **Second argument:** The value in `user.password` from the database (the hash created at registration).

- **What bcrypt does:** It reads the salt from the stored hash, hashes the plain-text password with that same salt and the same cost, and compares the result to the stored hash in a **constant-time** way. If they match, the password is correct.

- **Result:** Returns `true` if the password is correct, `false` otherwise. We never send the stored hash to the client; the comparison happens only on the server.

So: verification is “compare submitted password to stored hash with bcrypt”; there is no reversible decryption, and the same flow works regardless of how the hash was created (e.g. at register with `bcrypt.hash`).

---

## 3. How a Session Is Created After Successful Login

Because the session strategy is **JWT** (`session: { strategy: "jwt" }`), no database session row is created. The “session” is a signed JWT stored in an HTTP-only cookie. Flow after `authorize` returns a user:

1. **JWT creation**  
   NextAuth creates an internal JWT payload (e.g. sub, email, iat, exp). It then runs the **`jwt` callback** with:
   - `token`: that payload
   - `user`: the object returned from `authorize` (id, email, name, image, role)

   In our config:
   ```ts
   jwt({ token, user }) {
     if (user) {
       token.id = user.id;
       token.role = user.role;
     }
     return token;
   }
   ```
   So on **first sign-in**, when `user` is present, we add `id` and `role` to the token. The returned `token` is what gets stored in the JWT.

2. **Cookie**  
   NextAuth signs the JWT (with `NEXTAUTH_SECRET`), serializes it, and sets an HTTP-only cookie (e.g. `next-auth.session-token`) on the response. The client does not read this cookie; the browser sends it automatically on subsequent requests to the same site.

3. **Session callback (when the app asks for the session)**  
   When the client or server calls `getSession()` / `useSession()` or otherwise needs the session, NextAuth reads the cookie, verifies and decodes the JWT, and runs the **`session` callback** with:
   - `session`: object that will be sent to the client (has `user`, `expires`, etc.)
   - `token`: the decoded JWT payload (now including `id` and `role`)

   In our config:
   ```ts
   session({ session, token }) {
     if (session.user) {
       session.user.id = token.id ?? "";
       session.user.role = token.role ?? "";
     }
     return session;
   }
   ```
   So the session object the client (and API routes) see includes `session.user.id` and `session.user.role`.

4. **Result**  
   - After a successful login, the response includes the cookie.
   - On later requests, the server uses that cookie to reconstruct the session (decode JWT → run `session` callback) without hitting the database.
   - The client and server can use `session.user.id` and `session.user.role` for authorization.

**Summary:** Successful login → `authorize` returns user → NextAuth creates JWT → `jwt` callback adds `id` and `role` to the token → token is signed and stored in an HTTP-only cookie → when the session is requested, the JWT is decoded and the `session` callback fills `session.user.id` and `session.user.role`. No UI or new backend code is required beyond this flow.
