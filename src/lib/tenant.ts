import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOrg } from "@/lib/scope";

/**
 * Central tenant-scoping layer.
 *
 * Every server action / route / page must obtain its organizationId through
 * `requireOrg()` (or `getOrg()`), never from request input. This is the single
 * choke point that makes cross-tenant access impossible to forget: the id comes
 * from the authenticated session, and `db()` returns a thin wrapper whose helpers
 * always inject `organizationId` into the `where`.
 */

export interface TenantContext {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

export async function getOrg(): Promise<TenantContext | null> {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    organizationName: session.user.organizationName,
    role: session.user.role,
  };
}

/** Like getOrg() but redirects to /login when unauthenticated. */
export async function requireOrg(): Promise<TenantContext> {
  const ctx = await getOrg();
  if (!ctx) redirect("/login");
  return ctx;
}

export { prisma, assertOrg };
