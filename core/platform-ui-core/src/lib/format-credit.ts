/**
 * Format a dollar value for standard display (balances, invoices, top-ups).
 * Always exactly 2 decimal places: "$5.00"
 */
export function formatCreditStandard(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

/**
 * Format a dollar value for detailed/breakdown display (per-request costs, ledger rows).
 * Up to 9 decimal places (nanodollar precision), trailing zeros trimmed,
 * minimum 2 decimal places: "$0.000001", "$0.01", "$1.23"
 */
export function formatCreditDetailed(dollars: number): string {
  const full = dollars.toFixed(9);
  const dotIndex = full.indexOf(".");
  const whole = full.slice(0, dotIndex);
  const frac = full.slice(dotIndex + 1);
  let trimmed = frac.replace(/0+$/, "");
  if (trimmed.length < 2) {
    trimmed = trimmed.padEnd(2, "0");
  }
  return `$${whole}.${trimmed}`;
}
