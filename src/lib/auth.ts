import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// JWT-session auth (no DB adapter) so the NextAuth tables don't collide with
// our accounting `Account` model. The session carries the user's active
// organizationId, which every tenant-scoped query relies on.

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      organizationId: string;
      organizationName: string;
      role: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: {
            memberships: {
              include: { organization: true },
              orderBy: { createdAt: "asc" },
            },
          },
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        const membership = user.memberships[0];
        if (!membership) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: membership.organizationId,
          organizationName: membership.organization.name,
          role: membership.role,
        } as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          organizationId: string;
          organizationName: string;
          role: string;
        };
        token.id = u.id;
        token.organizationId = u.organizationId;
        token.organizationName = u.organizationName;
        token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.organizationId = token.organizationId as string;
      session.user.organizationName = token.organizationName as string;
      session.user.role = token.role as string;
      return session;
    },
  },
});
