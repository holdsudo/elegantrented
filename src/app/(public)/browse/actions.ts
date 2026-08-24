"use server";

import { redirect } from "next/navigation";
import { parseDay, today } from "@/lib/dates";
import { clientIp } from "@/lib/rate-limit";
import { countRecentRequestsFromIp, createRequest, getPublicGown } from "@/lib/queries";

export type RequestFormState = {
  error?: string;
  values?: { customerName: string; phone: string; email: string; partyDate: string; notes: string };
} | null;

const MAX_PER_IP_PER_DAY = 8;

/**
 * Take a booking request from the public site.
 *
 * This writes a BookingRequest and nothing else. It never creates a Rental, so
 * the date it names stays available to everyone — including other customers —
 * until the shop confirms it in the back office.
 */
export async function submitRequestAction(
  _prev: RequestFormState,
  formData: FormData
): Promise<RequestFormState> {
  const values = {
    customerName: String(formData.get("customerName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    partyDate: String(formData.get("partyDate") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim()
  };

  // Bots fill every field they find; a human never sees this one.
  if (String(formData.get("website") ?? "")) {
    redirect("/browse/sent");
  }

  const gownId = String(formData.get("gownId") ?? "").trim();
  const partyDate = parseDay(values.partyDate);

  if (!values.customerName) return { error: "Please tell us your name.", values };
  if (!values.phone && !values.email) {
    return { error: "Please leave a phone number or an email so we can reach you.", values };
  }
  if (!partyDate) return { error: "Please choose the date of your party.", values };
  if (partyDate < today()) return { error: "That date has already passed.", values };

  const gown = gownId ? await getPublicGown(gownId) : null;
  if (gownId && !gown) {
    return { error: "That dress is no longer listed. Please pick another.", values };
  }

  const ip = await clientIp();
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  if ((await countRecentRequestsFromIp(ip, since)) >= MAX_PER_IP_PER_DAY) {
    return {
      error: "That's a lot of requests from one place today. Please call us instead.",
      values
    };
  }

  await createRequest({
    gownId: gown?.id ?? null,
    gownText: gown ? null : String(formData.get("gownText") ?? "").trim() || null,
    customerName: values.customerName,
    phone: values.phone || null,
    email: values.email || null,
    partyDate,
    notes: values.notes || null,
    ip
  });

  redirect("/browse/sent");
}
