// Pure helpers for the trial-balance CSV import wizard: column auto-detection,
// amount parsing, and row validation. Mirrors lib/csv-import.ts (bank import).
import { parseAmountToCents } from "./csv-import";

export type TbFieldKey =
  | "accountNumber"
  | "accountName"
  | "debit"
  | "credit"
  | "accountType"
  | "description";

export const TB_REQUIRED_FIELDS: TbFieldKey[] = ["accountNumber", "accountName", "debit", "credit"];
export const TB_OPTIONAL_FIELDS: TbFieldKey[] = ["accountType", "description"];

export const TB_FIELD_LABELS: Record<TbFieldKey, string> = {
  accountNumber: "Account number",
  accountName: "Account name",
  debit: "Debit balance",
  credit: "Credit balance",
  accountType: "Account type",
  description: "Description",
};

const HINTS: Record<TbFieldKey, string[]> = {
  accountNumber: [
    "account number",
    "account no",
    "acct no",
    "acct",
    "gl code",
    "gl account",
    "account code",
    "code",
    "number",
    "account #",
    "acct #",
  ],
  accountName: ["account name", "account title", "acct name", "name", "title", "account"],
  debit: ["debit balance", "debit", "debits", "dr", "dr balance"],
  credit: ["credit balance", "credit", "credits", "cr", "cr balance"],
  accountType: ["account type", "type", "classification", "category", "class"],
  description: ["description", "memo", "notes", "note", "detail", "details"],
};

export function tbAutodetectMapping(headers: string[]): Record<TbFieldKey, string> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const used = new Set<string>();
  const mapping = {
    accountNumber: "",
    accountName: "",
    debit: "",
    credit: "",
    accountType: "",
    description: "",
  } as Record<TbFieldKey, string>;

  // Resolve the most specific fields first so "account" doesn't grab the name slot
  // before "account number" / "account type" are matched.
  const order: TbFieldKey[] = [
    "accountNumber",
    "accountType",
    "debit",
    "credit",
    "accountName",
    "description",
  ];
  for (const field of order) {
    const hints = HINTS[field];
    let bestIdx = -1;
    for (const exact of [true, false]) {
      for (let i = 0; i < headers.length; i++) {
        if (used.has(headers[i])) continue;
        const h = norm[i];
        const hit = hints.some((hint) => (exact ? h === hint : h.includes(hint)));
        if (hit) {
          bestIdx = i;
          break;
        }
      }
      if (bestIdx >= 0) break;
    }
    if (bestIdx >= 0) {
      mapping[field] = headers[bestIdx];
      used.add(headers[bestIdx]);
    }
  }
  return mapping;
}

export interface MappedTbRow {
  rowIndex: number; // 1-based source row (excluding header)
  accountNumber: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  accountType: string;
  description: string;
  errors: string[];
}

export function buildTbRows(
  raw: Record<string, string>[],
  mapping: Record<TbFieldKey, string>,
): MappedTbRow[] {
  const get = (row: Record<string, string>, field: TbFieldKey) =>
    mapping[field] ? (row[mapping[field]] ?? "") : "";
  return raw.map((row, i) => {
    const accountNumber = get(row, "accountNumber").trim();
    const accountName = get(row, "accountName").trim();
    const debitRaw = get(row, "debit");
    const creditRaw = get(row, "credit");
    // Treat blank/zero as no amount on that side.
    const dParsed = debitRaw.trim() ? parseAmountToCents(debitRaw) : 0;
    const cParsed = creditRaw.trim() ? parseAmountToCents(creditRaw) : 0;
    const debitCents = dParsed == null ? NaN : Math.abs(dParsed);
    const creditCents = cParsed == null ? NaN : Math.abs(cParsed);

    const errors: string[] = [];
    if (!mapping.accountNumber) errors.push("No Account number column mapped");
    else if (!accountNumber) errors.push("Missing account number");
    if (!mapping.accountName) errors.push("No Account name column mapped");
    else if (!accountName) errors.push("Missing account name");
    if (debitRaw.trim() && Number.isNaN(debitCents)) errors.push(`Non-numeric debit "${debitRaw}"`);
    if (creditRaw.trim() && Number.isNaN(creditCents))
      errors.push(`Non-numeric credit "${creditRaw}"`);
    if (
      !Number.isNaN(debitCents) &&
      !Number.isNaN(creditCents) &&
      debitCents > 0 &&
      creditCents > 0
    )
      errors.push("Row has both a debit and a credit");

    return {
      rowIndex: i + 1,
      accountNumber,
      accountName,
      debitCents: Number.isNaN(debitCents) ? 0 : debitCents,
      creditCents: Number.isNaN(creditCents) ? 0 : creditCents,
      accountType: get(row, "accountType").trim(),
      description: get(row, "description").trim(),
      errors,
    };
  });
}
