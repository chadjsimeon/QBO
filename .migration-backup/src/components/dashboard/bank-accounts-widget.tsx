import Link from "next/link";
import { Landmark, ArrowRight } from "lucide-react";
import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface BankWidgetItem {
  id: string;
  institutionName: string;
  accountMask: string | null;
  accountName: string;
  bankBalanceCents: number;
  bookBalanceCents: number;
  forReview: number;
}

export function BankAccountsWidget({ items }: { items: BankWidgetItem[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Bank accounts</CardTitle>
        <Link href="/banking" className="text-xs font-medium text-primary hover:underline">
          Go to banking
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Link href="/banking" className="text-primary hover:underline">
              Connect a bank account
            </Link>{" "}
            to track balances here.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((b) => {
              const diff = b.bankBalanceCents - b.bookBalanceCents;
              return (
                <li key={b.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {b.institutionName}
                        {b.accountMask ? ` ••${b.accountMask}` : ""}
                      </span>
                    </div>
                    {b.forReview > 0 && <Badge variant="warning">{b.forReview} to review</Badge>}
                  </div>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Bank balance</div>
                      <div className="text-lg font-bold tabular-nums">
                        {formatCents(b.bankBalanceCents)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-muted-foreground">In QuickBooks</div>
                      <div className="text-sm tabular-nums">{formatCents(b.bookBalanceCents)}</div>
                      {diff !== 0 && (
                        <div className="text-[11px] text-amber-700">
                          {formatCents(Math.abs(diff))} diff
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Link
                      href={`/banking/${b.id}`}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Review <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
