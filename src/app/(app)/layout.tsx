import { requireOrg } from "@/lib/tenant";
import { Sidebar } from "@/components/sidebar";
import { signOut } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireOrg();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar organizationName={ctx.organizationName} logout={logout} />
      <main className="flex-1 overflow-x-hidden bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
