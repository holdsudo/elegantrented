export { statusLabel } from "@/lib/enums";
import { listRentalsForGown, nextRentalNumber as allocateRentalNumber, paidTotalsFor } from "@/lib/queries";
import { addDays, today } from "@/lib/dates";
import { getSettings, settingNumber } from "@/lib/settings";

/** The dates a gown is actually spoken for, given what's filled in. */
export function occupiedWindow(rental: {
  partyDate: Date;
  pickupDate: Date | null;
  returnDate: Date | null;
}, pickupOffset: number, returnOffset: number): { from: Date; to: Date } {
  return {
    from: rental.pickupDate ?? addDays(rental.partyDate, -pickupOffset),
    to: rental.returnDate ?? addDays(rental.partyDate, returnOffset)
  };
}

export async function suggestDates(partyDate: Date) {
  const settings = await getSettings();
  return {
    pickupDate: addDays(partyDate, -settingNumber(settings, "pickupOffsetDays", 2)),
    returnDate: addDays(partyDate, settingNumber(settings, "returnOffsetDays", 2))
  };
}

export type GownConflict = {
  id: string;
  number: number;
  customerName: string;
  partyDate: Date;
  from: Date;
  to: Date;
};

/**
 * The double-booking check.
 *
 * Given a gown and the dates it would be out, find every other live rental of the
 * same gown whose window overlaps — padded by the configured conflict window, so a
 * same-weekend near-miss still warns. Cancelled rentals never conflict.
 */
export async function findGownConflicts(input: {
  gownId: string;
  partyDate: Date;
  pickupDate: Date | null;
  returnDate: Date | null;
  excludeRentalId?: string;
}): Promise<GownConflict[]> {
  const settings = await getSettings();
  const pickupOffset = settingNumber(settings, "pickupOffsetDays", 2);
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const pad = settingNumber(settings, "conflictWindowDays", 3);

  const mine = occupiedWindow(input, pickupOffset, returnOffset);
  const paddedFrom = addDays(mine.from, -pad);
  const paddedTo = addDays(mine.to, pad);

  // A gown has few rentals, so fetch its live ones and do the overlap test here
  // rather than expressing the window arithmetic in SQL.
  const candidates = await listRentalsForGown(input.gownId, ["BOOKED", "OUT", "RETURNED"]);

  const conflicts: GownConflict[] = [];
  for (const other of candidates) {
    if (input.excludeRentalId && other.id === input.excludeRentalId) continue;
    const theirs = occupiedWindow(other, pickupOffset, returnOffset);
    const overlaps = theirs.from <= paddedTo && theirs.to >= paddedFrom;
    if (overlaps) {
      conflicts.push({
        id: other.id,
        number: other.number,
        customerName: other.customerName,
        partyDate: other.partyDate,
        from: theirs.from,
        to: theirs.to
      });
    }
  }
  return conflicts;
}

export type PaymentState = "UNPAID" | "DEPOSIT" | "PAID";

export function paymentState(priceCents: number, paidCents: number): PaymentState {
  if (paidCents <= 0) return priceCents === 0 ? "PAID" : "UNPAID";
  if (paidCents < priceCents) return "DEPOSIT";
  return "PAID";
}

export function paymentLabel(state: PaymentState): string {
  if (state === "PAID") return "Paid in full";
  if (state === "DEPOSIT") return "Deposit";
  return "Unpaid";
}

export function isOverdue(rental: {
  status: string;
  partyDate: Date;
  returnDate: Date | null;
}, returnOffset: number, now = today()): boolean {
  if (rental.status === "RETURNED" || rental.status === "CANCELLED") return false;
  const due = rental.returnDate ?? addDays(rental.partyDate, returnOffset);
  return due < now;
}


/** Sum of payments per rental id, for list screens. */
export async function paidTotalsByRental(rentalIds: string[]): Promise<Map<string, number>> {
  return paidTotalsFor(rentalIds);
}

export function displayRentalNumber(number: number): string {
  return `R-${number}`;
}

const FIRST_RENTAL_NUMBER = 1000;

/**
 * Allocate the next rental number. The underlying UPDATE ... RETURNING is a
 * single statement, so two rentals saved at the same moment can't be handed the
 * same number — which matters, because that number is read out on the phone.
 */
export async function nextRentalNumber(): Promise<number> {
  return allocateRentalNumber(FIRST_RENTAL_NUMBER);
}

export function gownLabel(gown: { number: string; description: string } | null, fallback: string | null): string {
  if (gown) return `#${gown.number} — ${gown.description}`;
  return fallback?.trim() || "—";
}
