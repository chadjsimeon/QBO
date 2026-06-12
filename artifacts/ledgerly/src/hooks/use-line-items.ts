import { useState } from "react";

// Shared line-item array state for the document forms (invoice, bill, credit
// note, estimate, sales receipt, expense, PO, …). Generic over the line shape:
// forms differ in fields (taxRateId, memo, debit/credit), so each passes its
// own empty-line template and a function that yields a line's amount in cents.
export function useLineItems<T>(emptyLine: T, amountOf: (line: T) => number) {
  const [lines, setLines] = useState<T[]>([{ ...emptyLine }]);

  const updateLine = (i: number, field: keyof T, value: T[keyof T]) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  const addLine = () => setLines((ls) => [...ls, { ...emptyLine }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const subtotalCents = lines.reduce((s, l) => s + amountOf(l), 0);

  return { lines, setLines, updateLine, addLine, removeLine, subtotalCents };
}
