import { redirect } from "next/navigation";
import { getOrg } from "@/lib/tenant";

export default async function Home() {
  const ctx = await getOrg();
  redirect(ctx ? "/dashboard" : "/login");
}
