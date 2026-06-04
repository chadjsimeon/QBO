import { redirect } from "next/navigation";
import { getOrg } from "@/lib/tenant";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const ctx = await getOrg();
  if (ctx) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Ledgerly</h1>
          <p className="text-sm text-muted-foreground">
            Double-entry accounting
          </p>
        </div>
        <LoginForm />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo login: owner@acme.test / password123
        </p>
      </div>
    </main>
  );
}
