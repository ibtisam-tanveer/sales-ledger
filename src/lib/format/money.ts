/**
 * UK sterling display: £ prefix, full stop as decimal separator, two fraction digits.
 * No thousands grouping (avoids comma-separated values in the UI).
 */
export function formatPounds(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `£${amount.toFixed(2)}`;
}

/**
 * Value for money text fields — always a full stop as decimal separator (never `type="number"`,
 * which follows OS locale and may show commas).
 */
export function formatAmountForInput(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  return amount.toFixed(2);
}

/**
 * Parse a money text field: accepts `.` or `,` as decimal separator; strips grouping.
 */
/** Round to 2 decimal places (pence). */
export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseAmountInput(raw: string): number {
  let t = raw.trim().replace(/\s/g, "");
  if (!t) return NaN;
  const lc = t.lastIndexOf(",");
  const ld = t.lastIndexOf(".");
  if (lc !== -1 && lc > ld) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else {
    t = t.replace(/,/g, "");
  }
  return Number(t);
}
