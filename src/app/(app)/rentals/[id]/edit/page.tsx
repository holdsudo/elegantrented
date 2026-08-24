import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getRental, paidTotal } from "@/lib/queries";
import { toInputDay } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { getSettings, settingNumber } from "@/lib/settings";
import { displayRentalNumber } from "@/lib/rentals";
import { loadGownOptions } from "../../gown-options";
import { RentalForm } from "../../rental-form";

export const dynamic = "force-dynamic";

export default async function EditRentalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const rental = await getRental(id);
  if (!rental) notFound();

  const [settings, gowns, paidCents] = await Promise.all([
    getSettings(),
    loadGownOptions(rental.gownId),
    paidTotal(id)
  ]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Edit {displayRentalNumber(rental.number)}</h1>
          <div className="page-sub">{rental.customerName}</div>
        </div>
        <Link href={`/rentals/${rental.id}`} className="btn">
          Cancel
        </Link>
      </div>
      <div className="page">
        <RentalForm
          gowns={gowns}
          isEdit
          pickupOffset={settingNumber(settings, "pickupOffsetDays", 2)}
          returnOffset={settingNumber(settings, "returnOffsetDays", 2)}
          defaults={{
            id: rental.id,
            customerName: rental.customerName,
            phone: rental.phone ?? "",
            email: rental.email ?? "",
            writtenDate: toInputDay(rental.writtenDate),
            partyDate: toInputDay(rental.partyDate),
            pickupDate: toInputDay(rental.pickupDate),
            returnDate: toInputDay(rental.returnDate),
            gownId: rental.gownId ?? "",
            gownText: rental.gownText ?? "",
            price: centsToInput(rental.priceCents),
            paid: centsToInput(paidCents),
            status: rental.status,
            notes: rental.notes ?? ""
          }}
        />
      </div>
    </>
  );
}
