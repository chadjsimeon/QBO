import { z } from "zod";
import { dec, toCents, lineAmountCents, taxCents as computeTax } from "@/lib/money";

/**
 * Shared parsing/computation for invoices and bills. Both documents have the
 * same line shape (description, quantity, unit price, account, optional tax)
 * and the same money math: line amount = qty * unitPrice, tax per line by its
 * rate, totals summed exactly via decimal.js.
 *
 * The client submits line unit prices as dollar strings; we convert to integer
 * cents here so the float never reaches the database.
 */

export const rawLineSchema = z.object({
  description: z.string().trim().min(1, "Description required"),
  quantity: z.coerce.number().int("Whole number").min(1, "Min 1"),
  unitPrice: z.coerce.number().min(0, "Must be >= 0"),
  accountId: z.string().min(1, "Account required"),
  taxRateId: z.string().nullable().optional(),
});

export type RawLine = z.infer<typeof rawLineSchema>;

export const documentSchema = z.object({
  contactId: z.string().min(1, "Required"),
  number: z.string().trim().min(1, "Number required"),
  issueDate: z.string().min(1, "Issue date required"),
  dueDate: z.string().min(1, "Due date required"),
  lines: z.array(rawLineSchema).min(1, "Add at least one line"),
});

export interface ComputedLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRateId: string | null;
  accountId: string;
  amountCents: number;
  taxCents: number;
}

export interface ComputedDocument {
  lines: ComputedLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export function computeDocument(
  rawLines: RawLine[],
  taxRateBpsById: Map<string, number>
): ComputedDocument {
  const lines: ComputedLine[] = rawLines.map((l) => {
    const unitPriceCents = toCents(dec(l.unitPrice).times(100));
    const amountCents = lineAmountCents(l.quantity, unitPriceCents);
    const taxRateId = l.taxRateId || null;
    const rateBps = taxRateId ? taxRateBpsById.get(taxRateId) ?? 0 : 0;
    const taxCents = taxRateId ? computeTax(amountCents, rateBps) : 0;
    return {
      description: l.description,
      quantity: l.quantity,
      unitPriceCents,
      taxRateId,
      accountId: l.accountId,
      amountCents,
      taxCents,
    };
  });

  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = lines.reduce((s, l) => s + l.taxCents, 0);
  return {
    lines,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

/** Group computed line amounts by income/expense account for ledger posting. */
export function groupByAccount(
  lines: ComputedLine[]
): { accountId: string; amountCents: number }[] {
  const map = new Map<string, number>();
  for (const l of lines) {
    map.set(l.accountId, (map.get(l.accountId) ?? 0) + l.amountCents);
  }
  return [...map.entries()].map(([accountId, amountCents]) => ({
    accountId,
    amountCents,
  }));
}

/** Parse the JSON lines payload from the form's hidden field. */
export function parseLinesPayload(payload: FormDataEntryValue | null): unknown[] {
  if (typeof payload !== "string") return [];
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
