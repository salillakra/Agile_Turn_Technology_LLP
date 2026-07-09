import { redirect } from "next/navigation";
import { getServerSession, type DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcrypt";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    remember?: boolean;
  }
}

const REMEMBER_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days
const SESSION_MAX_AGE_SEC = 2 * 24 * 60 * 60; // 2 days when "Remember me" is off

const ROLES = ["ADMIN", "RECRUITER", "HIRING_MANAGER"] as const;

/**
 * NextAuth configuration.
 *
 * ## Providers
 * Define how users can sign in. Each provider (Credentials, Google, GitHub, etc.) exposes a sign-in
 * method. CredentialsProvider handles email/password: the authorize() function looks up the user in
 * the DB and verifies the password with bcrypt. Other providers would delegate to OAuth and use
 * the adapter to create/link User and Account records.
 *
 * ## Adapter
 * Connects NextAuth to the database via Prisma. It creates/updates User, Account, Session, and
 * VerificationToken records. With OAuth, the adapter stores the user and provider account; with
 * database sessions it would store the session. We use JWT sessions, so the adapter is used mainly
 * for User/Account persistence (e.g. when adding OAuth later).
 *
 * ## Session strategy
 * "jwt" means the session is stored in an encrypted HTTP-only cookie (no DB session row per login).
 * The server decodes the JWT on each request to get the user. JWT is required when using
 * CredentialsProvider because credentials do not support the same OAuth refresh flow that
 * database sessions use. Trade-off: no DB hit per request, but revoking a session requires
 * changing the secret or implementing a token blocklist.
 *
 * ## Remember me
 * When `remember` is true (credentials), JWT `exp` is set to ~30 days; otherwise ~2 days. The client
 * passes `remember: "true"` via `signIn("credentials", { ... })`.
 *
 * ## Sign in as role (optional)
 * If `expectedRole` is sent and non-empty, the user's `User.role` must match after password check.
 *
 * ## Callbacks
 * Run at specific points in the auth flow. jwt() is called when a token is created or updated:
 * we copy id and role from the user (from authorize()) into the token. session() is called when
 * the session is sent to the client: we copy id and role from the token into session.user so
 * components and API routes can read session.user.role for authorization.
 */
export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt" as const,
    maxAge: REMEMBER_MAX_AGE_SEC,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember", type: "text" },
        expectedRole: { label: "Expected role", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();
        /**
         * Case-insensitive match so logins work if the row was created before registration
         * normalized email to lowercase, or was inserted with different casing.
         * (PostgreSQL; `mode` is ignored on SQLite — this project uses PostgreSQL.)
         */
        const user = await prisma.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
          },
        });
        if (!user || !user.password) return null;
        const valid = await bcrypt.compare(
          String(credentials.password),
          user.password,
        );
        if (!valid) return null;

        const expected =
          typeof credentials.expectedRole === "string"
            ? credentials.expectedRole.trim()
            : "";
        if (
          expected &&
          ROLES.includes(expected as (typeof ROLES)[number]) &&
          user.role !== expected
        ) {
          return null;
        }

        const remember =
          credentials.remember === "true" ||
          String(credentials.remember ?? "").toLowerCase() === "true";

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? undefined,
          role: user.role,
          remember,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role;
        const remember = (user as { remember?: boolean }).remember === true;
        token.remember = remember;
        const maxAgeSeconds = remember
          ? REMEMBER_MAX_AGE_SEC
          : SESSION_MAX_AGE_SEC;
        token.exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? "";
        session.user.role = token.role ?? "";
      }
      return session;
    },
  },
  debug: true,
};

/**
 * Server-side session. Use in Server Components, Route Handlers, and server actions.
 * Returns the session or null if not logged in.
 */
export async function getSession() {
  return getServerSession(authOptions);
}

/**
 * Use in a Server Component or layout to require login and one of the given roles.
 * Redirects to /login if not authenticated, or to /unauthorized if role is not allowed.
 * @param allowedRoles - e.g. ["ADMIN"] or ["ADMIN", "RECRUITER"]
 * @returns session (so you can pass user/role to children)
 */
export async function requireAuth(allowedRoles?: (typeof ROLES)[number][]) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (
    allowedRoles?.length &&
    !allowedRoles.includes(session.user.role as (typeof ROLES)[number])
  ) {
    redirect("/unauthorized");
  }
  return session;
}
