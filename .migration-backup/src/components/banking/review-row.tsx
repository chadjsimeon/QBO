"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import type { BankFormState } from "@/app/(app)/banking/actions";
import type { MatchCandidate } from "@/lib/banking";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  CategorizePanel,
  type AccountOption,
  type PayeeOption,
} from "@/components/banking/categorize-panel";
import { MatchPanel } from "@/components/banking/match-panel";

export interface ReviewTxn {
  id: string;
  date: string;
  descriptionRaw: string;
  amountCents: number;
}

export function ReviewRow({
  txn,
  accounts,
  payees,
  candidates,
  categorizeAction,
  matchAction,
  excludeAction,
}: {
  txn: ReviewTxn;
  accounts: AccountOption[];
  payees: PayeeOption[];
  candidates: MatchCandidate[];
  categorizeAction: (prev: BankFormState, formData: FormData) => Promise<BankFormState>;
  matchAction: (prev: BankFormState, formData: FormData) => Promise<BankFormState>;
  excludeAction: () => void;
}) {
  const [panel, setPanel] = useState<"none" | "categorize" | "match">("none");
  const moneyIn = txn.amountCents > 0;

  return (
    <div className="border-b last:border-0">
      <div className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm">
        <div className="col-span-2 text-muted-foreground">{formatDate(txn.date)}</div>
        <div className="col-span-4 font-medium">{txn.descriptionRaw}</div>
        <div
          className={cn(
            "col-span-2 text-right tabular-nums",
            moneyIn ? "text-green-700" : "text-foreground"
          )}
        >
          {moneyIn ? "+" : "−"}
          {formatCents(Math.abs(txn.amountCents))}
        </div>
        <div className="col-span-4 flex justify-end gap-1">
          <Button
            variant={panel === "categorize" ? "default" : "outline"}
            size="sm"
            onClick={() => setPanel((p) => (p === "categorize" ? "none" : "categorize"))}
          >
            Categorize
          </Button>
          {candidates.length > 0 && (
            <Button
              variant={panel === "match" ? "default" : "secondary"}
              size="sm"
              onClick={() => setPanel((p) => (p === "match" ? "none" : "match"))}
            >
              Match ({candidates.length})
            </Button>
          )}
          <form action={excludeAction}>
            <Button variant="ghost" size="icon" type="submit" title="Exclude">
              <Ban className="h-4 w-4 text-muted-foreground" />
            </Button>
          </form>
        </div>
      </div>

      {panel !== "none" && (
        <div className="px-4 pb-4">
          {panel === "categorize" ? (
            <CategorizePanel
              action={categorizeAction}
              accounts={accounts}
              payees={payees}
              payeeFieldName={moneyIn ? "payeeCustomerId" : "payeeVendorId"}
              amountCents={txn.amountCents}
            />
          ) : (
            <MatchPanel action={matchAction} candidates={candidates} />
          )}
        </div>
      )}
    </div>
  );
}
