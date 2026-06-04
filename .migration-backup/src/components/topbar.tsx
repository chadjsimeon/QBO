"use client";

import { Search, Bell, Settings, HelpCircle, LogOut, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CreateMenu } from "@/components/create-menu";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "@/components/ui/dropdown";

export function Topbar({
  organizationName,
  userEmail,
  logout,
}: {
  organizationName: string;
  userEmail: string;
  logout: () => void;
}) {
  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur">
      {/* Global search */}
      <form action="/search" method="get" className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          placeholder="Search customers, vendors, invoices, bills…"
          className="pl-9"
          aria-label="Search"
        />
      </form>

      <div className="ml-auto flex items-center gap-1">
        <CreateMenu />

        <IconButton label="Notifications">
          <Bell className="h-4 w-4" />
        </IconButton>
        <IconButton label="Settings">
          <Settings className="h-4 w-4" />
        </IconButton>
        <IconButton label="Help">
          <HelpCircle className="h-4 w-4" />
        </IconButton>

        <Dropdown
          align="end"
          trigger={
            <button
              type="button"
              className="ml-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-accent"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          }
        >
          <DropdownLabel>{userEmail}</DropdownLabel>
          <div className="px-2.5 pb-1 text-xs text-muted-foreground">{organizationName}</div>
          <DropdownSeparator />
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-accent"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" /> Sign out
            </button>
          </form>
        </Dropdown>
      </div>
    </header>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
