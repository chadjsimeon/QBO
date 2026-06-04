"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  CreditCard,
  Landmark,
  Users,
  Building2,
  BookOpen,
  BarChart3,
  FileBarChart,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/banking", label: "Banking", icon: Landmark },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/vendors", label: "Vendors", icon: Building2 },
  { href: "/accounts", label: "Chart of Accounts", icon: BookOpen },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/management-reports", label: "Management Reports", icon: FileBarChart },
];

export function Sidebar({
  organizationName,
  logout,
}: {
  organizationName: string;
  userEmail?: string;
  logout: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
      <div className="border-b px-5 py-4">
        <div className="text-lg font-bold tracking-tight">Ledgerly</div>
        <div className="truncate text-xs text-muted-foreground">
          {organizationName}
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
