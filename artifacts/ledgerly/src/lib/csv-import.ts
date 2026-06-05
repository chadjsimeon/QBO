// Pure helpers for the bank CSV import wizard: column auto-detection, date and
// amount parsing/validation. Kept separate from the React component so they're
// easy to reason about and reuse.

export type FieldKey = "date" | "amount" | "description" | "reference" | "payee" | "type" | "category";

export const REQUIRED_FIELDS: FieldKey[] = ["date", "amount", "description"];
export const OPTIONAL_FIELDS: FieldKey[] = ["reference", "payee", "type", "category"];

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: "Date",
  amount: "Amount",
  description: "Description / Memo",
  reference: "Reference number",
  payee: "Payee",
  type: "Transaction type",
  category: "Category",
};

const HINTS: Record<FieldKey, string[]> = {
  date: ["date", "transaction date", "posted", "posting date", "trans date", "post date"],
  amount: ["amount", "amt", "value", "transaction amount"],
  description: ["description", "memo", "details", "narrative", "transaction", "particulars"],
  reference: ["reference", "ref", "ref no", "check", "cheque", "check number", "transaction id", "fitid"],
  payee: ["payee", "merchant", "paid to", "received from", "name", "counterparty"],
  type: ["type", "transaction type", "debit/credit", "dr/cr", "direction"],
  category: ["category", "account", "class", "tag"],
};

/** Map detected headers to fields by common naming. Avoids assigning one header twice. */
export function autodetectMapping(headers: string[]): Record<FieldKey, string> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const used = new Set<string>();
  const mapping = { date: "", amount: "", description: "", reference: "", payee: "", type: "", category: "" } as Record<FieldKey, string>;

  const order: FieldKey[] = ["date", "amount", "type", "reference", "description", "payee", "category"];
  for (const field of order) {
    const hints = HINTS[field];
    let bestIdx = -1;
    // exact match first, then "includes"
    for (const exact of [true, false]) {
      for (let i = 0; i < headers.length; i++) {
        if (used.has(headers[i])) continue;
        const h = norm[i];
        const hit = hints.some((hint) => (exact ? h === hint : h.includes(hint)));
        if (hit) { bestIdx = i; break; }
      }
      if (bestIdx >= 0) break;
    }
    if (bestIdx >= 0) { mapping[field] = headers[bestIdx]; used.add(headers[bestIdx]); }
  }
  return mapping;
}

export type DateFormat = "AUTO" | "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export function parseDate(raw: string | undefined, fmt: DateFormat): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const iso = () => { const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
  const slash = (dayFirst: boolean) => {
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) return null;
    let y = Number(m[3]); if (y < 100) y += 2000;
    const first = Number(m[1]), second = Number(m[2]);
    const day = dayFirst ? first : second, mon = dayFirst ? second : first;
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return new Date(y, mon - 1, day);
  };

  let d: Date | null = null;
  if (fmt === "YYYY-MM-DD") d = iso();
  else if (fmt === "MM/DD/YYYY") d = slash(false);
  else if (fmt === "DD/MM/YYYY") d = slash(true);
  else d = iso() || slash(false) || slash(true) || (() => { const x = new Date(s); return isNaN(x.getTime()) ? null : x; })();

  return d && !isNaN(d.getTime()) ? d : null;
}

/** Parse an amount string to integer cents. Returns null if not numeric. A type
 *  hint (e.g. "debit"/"withdrawal") sets the sign when the amount is unsigned. */
export function parseAmountToCents(raw: string | undefined, typeHint?: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (s === "" || isNaN(Number(s))) return null;
  let cents = Math.round(Number(s) * 100);
  if (neg) cents = -cents;
  if (typeHint) {
    const t = typeHint.toLowerCase();
    if (/(debit|withdrawal|payment|paid|expense|out|\bdr\b)/.test(t) && cents > 0) cents = -cents;
    else if (/(credit|deposit|received|income|\bin\b|\bcr\b)/.test(t) && cents < 0) cents = Math.abs(cents);
  }
  return cents;
}

export interface MappedRow {
  rowIndex: number; // 1-based source row (excluding header)
  date: Date | null;
  dateRaw: string;
  amountCents: number | null;
  amountRaw: string;
  description: string;
  referenceNumber: string;
  payeeName: string;
  errors: string[];
}

export function buildRows(
  raw: Record<string, string>[],
  mapping: Record<FieldKey, string>,
  fmt: DateFormat,
): MappedRow[] {
  const get = (row: Record<string, string>, field: FieldKey) => (mapping[field] ? (row[mapping[field]] ?? "") : "");
  return raw.map((row, i) => {
    const dateRaw = get(row, "date");
    const amountRaw = get(row, "amount");
    const typeHint = get(row, "type");
    const description = (get(row, "description") || "").trim();
    const date = parseDate(dateRaw, fmt);
    const amountCents = parseAmountToCents(amountRaw, typeHint);
    const errors: string[] = [];
    if (!mapping.date) errors.push("No Date column mapped");
    else if (!date) errors.push(`Unparseable date "${dateRaw}"`);
    if (!mapping.amount) errors.push("No Amount column mapped");
    else if (amountCents === null) errors.push(`Non-numeric amount "${amountRaw}"`);
    if (!mapping.description) errors.push("No Description column mapped");
    else if (!description) errors.push("Empty description");
    return {
      rowIndex: i + 1,
      date, dateRaw,
      amountCents, amountRaw,
      description,
      referenceNumber: (get(row, "reference") || "").trim(),
      payeeName: (get(row, "payee") || "").trim(),
      errors,
    };
  });
}
