import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword, IdentityError } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import type { Role } from "@/lib/types";
import { loadLiveUser } from "@/lib/liveUser";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = (credentials?.email as string | undefined)?.toLowerCase().trim();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email }, include: { organization: { select: { status: true } } } });
        if (!user) return null;
        if (user.status !== "ACTIVE") return null;
        // A suspended agency cannot sign in at all.
        if (user.organization.status !== "ACTIVE") return null;

        let valid = false;
        try {
          valid = await verifyPassword(user, password);
        } catch (e) {
          // The sign-in service being unreachable must not read as "wrong password" to the logs.
          if (e instanceof IdentityError) console.error("login:", e.message);
          else throw e;
        }
        if (!valid) return null;
        // One entry per person per 10 minutes, so repeated sign-ins in a short test or a flaky connection do not flood the log.
        const recent = await prisma.activity.findFirst({ where: { organizationId: user.organizationId, type: "user_login", agentId: user.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } }, select: { id: true } }).catch(() => null);
        if (!recent) void logActivity(user.organizationId, { type: "user_login", agentId: user.id, note: user.email });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          organizationId: user.organizationId,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: string }).role;
        token.status = (user as { status: string }).status;
        token.organizationId = (user as { organizationId: string }).organizationId;
      }
      // Sessions issued before multi-agency support have no organization in
      // the token yet - fill it in once instead of forcing everyone to log in again.
      if (!token.organizationId && token.id) {
        const row = await prisma.user.findUnique({ where: { id: token.id as string }, select: { organizationId: true } });
        if (row) token.organizationId = row.organizationId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.organizationId = token.organizationId as string;
        session.user.status = token.status as "ACTIVE" | "INACTIVE";
        // Role and permissions come from the database (reused for a few seconds), not the sign-in token, so a
        // change made by an admin shows in the person's open screens without signing in again.
        const live = await loadLiveUser(session.user.id).catch(() => null);
        if (live) session.user.role = live.role as Role;
        session.user.permissions = live?.permissions ?? [];
      }
      return session;
    },
  },
});
