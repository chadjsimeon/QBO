import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Receipt, CreditCard,
  Users, Building2, BookOpen, Landmark, BarChart3, FileBarChart,
  LogOut, Menu, X, Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { CreateMenu } from "@/components/create-menu";
import { useState } from "react";

const NAV = [
  { label: "Home",               href: "/dashboard",           icon: LayoutDashboard },
  { label: "Invoices",           href: "/invoices",            icon: FileText },
  { label: "Bills",              href: "/bills",               icon: Receipt },
  { label: "Payments",           href: "/payments",            icon: CreditCard },
  { label: "Customers",          href: "/customers",           icon: Users },
  { label: "Vendors",            href: "/vendors",             icon: Building2 },
  { label: "Accounts",           href: "/accounts",            icon: BookOpen },
  { label: "Banking",            href: "/banking",             icon: Landmark },
  { label: "Reports",            href: "/reports",             icon: BarChart3 },
  { label: "Mgmt Reports",       href: "/management-reports",  icon: FileBarChart },
];

function NavItem({ href, icon: Icon, label, close }: { href: string; icon: React.ElementType; label: string; close?: () => void }) {
  const [location] = useLocation();
  const active = location === href || (href !== "/dashboard" && location.startsWith(href));
  return (
    <Link href={href}>
      <a
        onClick={close}
        className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </a>
    </Link>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const sidebar = (
    <nav className="flex flex-col h-full bg-sidebar">
      {/* Logo / wordmark */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <div className="h-7 w-7 rounded-md bg-sidebar-primary flex items-center justify-center shrink-0">
          <BookOpen className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="font-bold text-sm tracking-wide text-sidebar-foreground">Ledgerly</span>
      </div>

      {/* Nav links */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {NAV.map(n => (
          <NavItem key={n.href} {...n} close={() => setSidebarOpen(false)} />
        ))}
      </div>

      {/* Bottom: org + sign out */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        {user?.organizationName && (
          <p className="px-3 pb-1 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider truncate">
            {user.organizationName}
          </p>
        )}
        <div className="px-3 pb-1 text-xs text-sidebar-foreground/50 truncate">{user?.email}</div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-col shrink-0">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 flex flex-col lg:hidden transform transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex justify-end px-3 pt-3 bg-sidebar border-b border-sidebar-border">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}
            className="text-sidebar-foreground hover:bg-sidebar-accent">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="h-14 border-b flex items-center gap-3 px-4 bg-background shrink-0 shadow-sm">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/search">
            <a className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-1.5 ml-2 bg-muted/40 min-w-[200px]">
              <Search className="h-3.5 w-3.5 shrink-0" />
              Search…
            </a>
          </Link>
          <div className="flex-1" />
          <CreateMenu />
          {user?.organizationName && (
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-medium">{user.organizationName}</span>
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold select-none">
                {user.organizationName.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-x-hidden bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
