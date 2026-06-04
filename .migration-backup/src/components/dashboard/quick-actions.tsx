import Link from "next/link";
import { FileText, Receipt, Landmark, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";

const ACTIONS = [
  { href: "/invoices/new", label: "Create invoice", icon: FileText },
  { href: "/bills/new", label: "Record expense", icon: Receipt },
  { href: "/banking", label: "Add bank deposit", icon: Landmark },
  { href: "/banking", label: "Create cheque", icon: CreditCard },
];

export function QuickActions() {
  return (
    <div className="mb-6 grid grid-cols-4 gap-3">
      {ACTIONS.map((a) => (
        <Link key={a.label} href={a.href}>
          <Card className="flex items-center gap-3 px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-accent/40">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <a.icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium">{a.label}</span>
          </Card>
        </Link>
      ))}
    </div>
  );
}
