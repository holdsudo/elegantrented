import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listRentals } from "@/lib/queries";
import { addDays, toInputDay, today } from "@/lib/dates";
import { getSettings, settingNumber } from "@/lib/settings";
import { isOverdue, paidTotalsByRental, statusLabel } from "@/lib/rentals";

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not authorized", { status: 401 });

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const filter = url.searchParams.get("filter") ?? "upcoming";

  const settings = await getSettings();
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const now = today();

  const rentals = await listRentals({ search: query || undefined });

  const paidTotals = await paidTotalsByRental(rentals.map((rental) => rental.id));

  const rows = rentals.filter((rental) => {
    const paid = paidTotals.get(rental.id) ?? 0;
    if (filter === "upcoming") return rental.partyDate >= now && rental.status !== "CANCELLED";
    if (filter === "month") return toInputDay(rental.partyDate).slice(0, 7) === toInputDay(now).slice(0, 7);
    if (filter === "balance") return rental.priceCents - paid > 0 && rental.status !== "CANCELLED";
    if (filter === "overdue") return isOverdue(rental, returnOffset, now);
    return true;
  });

  const header = [
    "Rental",
    "Name",
    "Phone",
    "Email",
    "Date",
    "Date of party",
    "Pickup",
    "Return",
    "Gown",
    "Price",
    "Paid",
    "Balance",
    "Status",
    "Notes"
  ];

  const lines = [header.join(",")];
  for (const rental of rows) {
    const paid = paidTotals.get(rental.id) ?? 0;
    lines.push(
      [
        `R-${rental.number}`,
        rental.customerName,
        rental.phone ?? "",
        rental.email ?? "",
        toInputDay(rental.writtenDate),
        toInputDay(rental.partyDate),
        toInputDay(rental.pickupDate),
        toInputDay(rental.returnDate ?? addDays(rental.partyDate, returnOffset)),
        rental.gown ? `#${rental.gown.number} ${rental.gown.description}` : rental.gownText ?? "",
        (rental.priceCents / 100).toFixed(2),
        (paid / 100).toFixed(2),
        ((rental.priceCents - paid) / 100).toFixed(2),
        statusLabel(rental.status),
        rental.notes ?? ""
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const filename = `rentals-${filter}-${toInputDay(now)}.csv`;
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
