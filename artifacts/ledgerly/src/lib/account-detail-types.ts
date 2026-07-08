// Shared catalog of account "detail types" (subtypes) per top-level account type,
// used by both the Chart of Accounts editor and the trial-balance import wizard.
// The banking subtypes ("bank", "savings", "credit_card") are what surface an
// account in the Banking tab — see api-server routes accounts.ts / banking.ts.

export const DETAIL_TYPES: Record<string, Array<{ value: string; label: string }>> = {
  ASSET: [
    { value: "bank", label: "Bank" },
    { value: "savings", label: "Savings" },
    { value: "cash_on_hand", label: "Cash on hand" },
    { value: "receivable", label: "Accounts receivable (A/R)" },
    { value: "inventory", label: "Inventory" },
    { value: "prepaid", label: "Prepaid expenses" },
    { value: "fixed", label: "Fixed assets" },
    { value: "accumulated_depreciation", label: "Accumulated depreciation" },
    { value: "general", label: "Other asset" },
  ],
  LIABILITY: [
    { value: "payable", label: "Accounts payable (A/P)" },
    { value: "credit_card", label: "Credit card" },
    { value: "tax", label: "Sales tax payable" },
    { value: "other_current", label: "Other current liabilities" },
    { value: "deferred_revenue", label: "Deferred revenue" },
    { value: "long_term", label: "Long-term liabilities" },
    { value: "general", label: "Other liability" },
  ],
  EQUITY: [
    { value: "equity", label: "Owner's equity" },
    { value: "retained", label: "Retained earnings" },
    { value: "general", label: "Opening balance equity" },
  ],
  INCOME: [
    { value: "revenue", label: "Service/fee income" },
    { value: "product_sales", label: "Sales of product income" },
    { value: "other_income", label: "Other primary income" },
    { value: "general", label: "Other income" },
  ],
  EXPENSE: [
    { value: "cogs", label: "Cost of goods sold" },
    { value: "payroll", label: "Payroll expenses" },
    { value: "facilities", label: "Rent or lease" },
    { value: "utilities", label: "Utilities" },
    { value: "software", label: "Office/General administrative" },
    { value: "travel", label: "Travel expenses" },
    { value: "marketing", label: "Advertising/Promotional" },
    { value: "professional", label: "Legal & professional fees" },
    { value: "bank_fees", label: "Bank charges" },
    { value: "general", label: "Other business expenses" },
  ],
};

export function detailLabel(type: string, subtype: string) {
  return DETAIL_TYPES[type]?.find((d) => d.value === subtype)?.label ?? subtype;
}

// Pick a sensible default detail type for a freshly created account. Used by the
// trial-balance import, which only knows the top-level type — a light name match
// lets common bank/credit-card accounts land on a banking subtype automatically.
// Defaults to "general" (present in every type's list) so nothing is mis-classified
// unless the name clearly indicates a bank/credit-card account.
export function defaultSubtypeFor(type: string, name?: string): string {
  const n = (name ?? "").toLowerCase();
  if (type === "ASSET") {
    if (/\bsavings\b/.test(n)) return "savings";
    if (/\b(bank|checking|chequing|cash)\b/.test(n)) return "bank";
  } else if (type === "LIABILITY") {
    if (/credit\s*card/.test(n)) return "credit_card";
  }
  return "general";
}
