"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRentalStatus } from "@/lib/enums";
import { requireUser } from "@/lib/auth";
import {
  createPayment,
  createRental,
  deletePayment,
  deleteRental,
  paidTotal,
  setRentalStatus,
  updateRental,
  upsertCustomer
} from "@/lib/queries";
import { parseDay, today, toInputDay } from "@/lib/dates";
import { centsFromInput } from "@/lib/money";
import { findGownConflicts, nextRentalNumber } from "@/lib/rentals";

export type ConflictNotice = {
  id: string;
  number: number;
  customerName: string;
  partyDate: string;
  from: string;
  to: string;
};

/** Everything the form put on the wire, echoed back so a rejected submit keeps it. */
export type RentalValues = {
  customerName: string;
  phone: string;
  email: string;
  writtenDate: string;
  partyDate: string;
  pickupDate: string;
  returnDate: string;
  gownId: string;
  gownText: string;
  price: string;
  paid: string;
  status: string;
  notes: string;
};

export type RentalFormState = {
  error?: string;
  conflicts?: ConflictNotice[];
  values?: RentalValues;
} | null;

function readValues(formData: FormData): RentalValues {
  const text = (key: string) => String(formData.get(key) ?? "");
  return {
    customerName: text("customerName"),
    phone: text("phone"),
    email: text("email"),
    writtenDate: text("writtenDate"),
    partyDate: text("partyDate"),
    pickupDate: text("pickupDate"),
    returnDate: text("returnDate"),
    gownId: text("gownId"),
    gownText: text("gownText"),
    price: text("price"),
    paid: text("paid"),
    status: text("status") || "BOOKED",
    notes: text("notes")
  };
}

/**
 * Create or update a rental.
 *
 * "Paid" behaves like a ledger column: you type the total received, and the
 * difference against what's already recorded is appended as a payment. That keeps
 * the familiar single field while leaving a real payment history behind it.
 */
export async function saveRentalAction(
  _prev: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  await requireUser();

  const values = readValues(formData);
  const id = String(formData.get("id") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const gownId = String(formData.get("gownId") ?? "").trim();
  const gownText = String(formData.get("gownText") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const status = parseRentalStatus(formData.get("status"));
  const override = formData.get("override") === "1";

  const writtenDate = parseDay(formData.get("writtenDate")) ?? today();
  const partyDate = parseDay(formData.get("partyDate"));
  const pickupDate = parseDay(formData.get("pickupDate"));
  const returnDate = parseDay(formData.get("returnDate"));

  const priceCents = centsFromInput(formData.get("price"));
  const paidCents = centsFromInput(formData.get("paid"));

  if (!customerName) return { error: "A name is required.", values };
  if (!partyDate) return { error: "A date of party is required.", values };
  if (pickupDate && returnDate && returnDate < pickupDate) {
    return { error: "The return date can't be before the pickup date.", values };
  }
  if (paidCents < 0) return { error: "Paid can't be negative.", values };

  if (gownId && !override) {
    const conflicts = await findGownConflicts({
      gownId,
      partyDate,
      pickupDate,
      returnDate,
      excludeRentalId: id || undefined
    });
    if (conflicts.length > 0) {
      return {
        values,
        conflicts: conflicts.map((conflict) => ({
          id: conflict.id,
          number: conflict.number,
          customerName: conflict.customerName,
          partyDate: toInputDay(conflict.partyDate),
          from: toInputDay(conflict.from),
          to: toInputDay(conflict.to)
        }))
      };
    }
  }

  // Every rental attaches to a customer record. Staff still just type a name and
  // a number; the matching happens behind them, keyed on the phone.
  const customerId = await upsertCustomer({
    name: customerName,
    phone: phone || null,
    email: email || null
  });

  const data = {
    customerName,
    phone: phone || null,
    email: email || null,
    customerId,
    writtenDate,
    partyDate,
    pickupDate,
    returnDate,
    gownId: gownId || null,
    gownText: gownId ? null : gownText || null,
    priceCents,
    status,
    notes: notes || null
  };

  let rentalId = id;

  if (id) {
    await updateRental(id, data);
  } else {
    rentalId = await createRental(data, await nextRentalNumber());
  }

  // Reconcile the Paid column against recorded payments.
  const recorded = await paidTotal(rentalId);
  const delta = paidCents - recorded;
  if (delta !== 0) {
    await createPayment({
      rentalId,
      amountCents: delta,
      method: delta > 0 ? "Recorded" : "Adjustment",
      paidOn: today(),
      note: id ? "Adjusted from the rental form" : "Entered with the rental"
    });
  }

  revalidatePath("/");
  revalidatePath("/money");
  revalidatePath("/calendar");
  redirect(`/rentals/${rentalId}`);
}

export async function recordPaymentAction(formData: FormData) {
  await requireUser();

  const rentalId = String(formData.get("rentalId") ?? "");
  const amountCents = centsFromInput(formData.get("amount"));
  const method = String(formData.get("method") ?? "Cash").trim() || "Cash";
  const paidOn = parseDay(formData.get("paidOn")) ?? today();
  const note = String(formData.get("note") ?? "").trim();

  if (!rentalId || amountCents === 0) {
    redirect(`/rentals/${rentalId}`);
  }

  await createPayment({ rentalId, amountCents, method, paidOn, note: note || null });

  revalidatePath(`/rentals/${rentalId}`);
  revalidatePath("/");
  revalidatePath("/money");
  redirect(`/rentals/${rentalId}`);
}

export async function deletePaymentAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("paymentId") ?? "");
  const rentalId = String(formData.get("rentalId") ?? "");
  if (id) await deletePayment(id);
  revalidatePath(`/rentals/${rentalId}`);
  revalidatePath("/");
  revalidatePath("/money");
  redirect(`/rentals/${rentalId}`);
}

export async function setRentalStatusAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("rentalId") ?? "");
  const status = parseRentalStatus(formData.get("status"));
  if (id && status) {
    await setRentalStatus(id, status);
  }
  revalidatePath(`/rentals/${id}`);
  revalidatePath("/");
  redirect(`/rentals/${id}`);
}

export async function deleteRentalAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("rentalId") ?? "");
  if (id) await deleteRental(id);
  revalidatePath("/");
  revalidatePath("/money");
  redirect("/");
}
