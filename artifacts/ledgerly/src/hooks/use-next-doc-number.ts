// Suggest the next document number as `${prefix}-0001`-style from the
// resource's record count. Matches the forms' historical behavior (count + 1 —
// can collide after deletions; the field stays editable so users can correct).
export function nextDocNumber(prefix: string, count: number): string {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}
