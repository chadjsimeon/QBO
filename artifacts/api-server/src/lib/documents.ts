import { db, taxRates } from "@workspace/db";
import { eq } from "drizzle-orm";

// Shared line-item math for documents (invoices/bills/expenses/sales receipts).
export interface RawLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  accountId: string;
  taxRateId?: string | null;
}

export async function getTaxMap(orgId: string): Promise<Map<string, number>> {
  const rates = await db.select().from(taxRates).where(eq(taxRates.organizationId, orgId));
  return new Map(rates.map(r => [r.id, r.rateBps]));
}

export function computeLines(lines: RawLine[], taxMap: Map<string, number>) {
  return lines.map(l => {
    const amt = (Number(l.quantity) || 0) * (Number(l.unitPriceCents) || 0);
    const rateBps = l.taxRateId ? (taxMap.get(l.taxRateId) ?? 0) : 0;
    const taxCents = l.taxRateId ? Math.round((amt * rateBps) / 10000) : 0;
    return { ...l, amountCents: amt, taxCents };
  });
}

export function sumTotals(computed: Array<{ amountCents: number; taxCents: number }>) {
  const subtotalCents = computed.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = computed.reduce((s, l) => s + l.taxCents, 0);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}
