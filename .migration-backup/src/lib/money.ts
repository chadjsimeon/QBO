import Decimal from "decimal.js";

// Money is stored as integer cents everywhere in the DB. All arithmetic goes
// through decimal.js so we never touch IEEE floats. Format only at display.

export function dec(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

/** Round a decimal amount of cents to a whole integer cent count. */
export function toCents(value: Decimal.Value): number {
  return dec(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Line amount in cents = quantity * unitPriceCents.
 * Quantity is an integer in the schema, but compute via Decimal regardless.
 */
export function lineAmountCents(quantity: number, unitPriceCents: number): number {
  return toCents(dec(quantity).times(unitPriceCents));
}

/** Tax in cents for a base amount given a rate in basis points (825 = 8.25%). */
export function taxCents(baseCents: number, rateBps: number): number {
  return toCents(dec(baseCents).times(rateBps).dividedBy(10000));
}

/** Sum a list of cent amounts exactly. */
export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Format integer cents as a currency string, e.g. 123456 -> "$1,234.56". */
export function formatCents(
  cents: number,
  opts: { currency?: string; locale?: string } = {}
): string {
  const { currency = "USD", locale = "en-US" } = opts;
  const dollars = dec(cents).dividedBy(100).toNumber();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(dollars);
}
