/** Money is integer cents everywhere. These are the only places it converts. */

export function centsFromInput(raw: FormDataEntryValue | null | undefined): number {
  if (raw == null) return 0;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** "225.00" — for value attributes on number inputs. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** "$225.00" — for display. */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(cents / 100);
}
