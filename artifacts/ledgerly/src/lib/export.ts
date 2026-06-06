// Small client-side helpers for exporting report data.

function escapeCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // Quote if the cell contains a comma, quote, or newline.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Trigger a browser download of `rows` as a CSV file. */
export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map(r => r.map(escapeCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Format integer cents as a plain number string for CSV (no currency symbol). */
export function centsToPlain(cents: number): string {
  return (cents / 100).toFixed(2);
}
