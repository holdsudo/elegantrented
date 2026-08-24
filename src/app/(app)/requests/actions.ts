"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays, today } from "@/lib/dates";
import { getSettings, settingNumber } from "@/lib/settings";
import { findGownConflicts, nextRentalNumber } from "@/lib/rentals";
import {
  createRental,
  deleteRequest,
  getRequest,
  setRequestStatus
} from "@/lib/queries";

/**
 * Confirm a request — the only place a customer's date becomes a real booking.
 *
 * Up to this moment the request has blocked nothing. Confirming creates the
 * Rental, and the Rental is what the availability check reads, so the date
 * closes here and only here.
 */
export async function confirmRequestAction(formData: FormData) {
  await requireUser();

  const id = String(formData.get("requestId") ?? "");
  const override = formData.get("override") === "1";

  const request = await getRequest(id);
  if (!request) redirect("/requests");

  const settings = await getSettings();
  const pickupOffset = settingNumber(settings, "pickupOffsetDays", 2);
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);

  const pickupDate = request.pickupDate ?? addDays(request.partyDate, -pickupOffset);
  const returnDate = request.returnDate ?? addDays(request.partyDate, returnOffset);

  // Same double-booking check the back office uses, so confirming a request can
  // never quietly create the clash the check exists to prevent.
  if (request.gownId && !override) {
    const conflicts = await findGownConflicts({
      gownId: request.gownId,
      partyDate: request.partyDate,
      pickupDate,
      returnDate
    });
    if (conflicts.length > 0) {
      redirect(`/requests?conflict=${id}`);
    }
  }

  const rentalId = await createRental(
    {
      customerName: request.customerName,
      phone: request.phone,
      email: request.email,
      writtenDate: today(),
      partyDate: request.partyDate,
      pickupDate,
      returnDate,
      gownId: request.gownId,
      gownText: request.gownId ? null : request.gownText,
      priceCents: 0,
      status: "BOOKED",
      notes: request.notes ? `From website request:\n${request.notes}` : "From website request"
    },
    await nextRentalNumber()
  );

  await setRequestStatus(id, "CONFIRMED", rentalId);

  revalidatePath("/requests");
  revalidatePath("/");
  redirect(`/rentals/${rentalId}`);
}

export async function declineRequestAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("requestId") ?? "");
  if (id) await setRequestStatus(id, "DECLINED");
  revalidatePath("/requests");
  redirect("/requests");
}

export async function reopenRequestAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("requestId") ?? "");
  if (id) await setRequestStatus(id, "PENDING");
  revalidatePath("/requests");
  redirect("/requests");
}

export async function deleteRequestAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("requestId") ?? "");
  if (id) await deleteRequest(id);
  revalidatePath("/requests");
  redirect("/requests");
}
