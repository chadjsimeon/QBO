import Link from "next/link";
import { BarChart3, Scale, Clock, Clock4 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

const REPORTS = [
  {
    href: "/reports/profit-loss",
    title: "Profit & Loss",
    description: "Income less expenses over a period.",
    icon: BarChart3,
  },
  {
    href: "/reports/profit-loss?nonzero=1",
    title: "Profit & Loss — Non-Zero",
    description: "P&L with zero-activity accounts suppressed.",
    icon: BarChart3,
  },
  {
    href: "/reports/balance-sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities and equity as of a date.",
    icon: Scale,
  },
  {
    href: "/reports/ar-aging",
    title: "A/R Aging",
    description: "Open customer balances by days overdue.",
    icon: Clock,
  },
  {
    href: "/reports/ap-aging",
    title: "A/P Aging",
    description: "Open vendor balances by days overdue.",
    icon: Clock4,
  },
];

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Accrual-basis financial statements, read straight from the ledger."
      />
      <div className="grid grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="transition-colors hover:border-foreground/30">
              <CardContent className="flex items-start gap-3 pt-6">
                <r.icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-sm text-muted-foreground">{r.description}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
