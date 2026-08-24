import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { toInputDay, today } from "@/lib/dates";
import { getSettings, settingNumber } from "@/lib/settings";
import { loadGownOptions } from "../gown-options";
import { RentalForm } from "../rental-form";

export const metadata = { title: "New rental" };
export const dynamic = "force-dynamic";

export default async function NewRentalPage({
  searchParams
}: {
  searchParams: Promise<{ gown?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const settings = await getSettings();
  const gowns = await loadGownOptions();
  const preselected = gowns.find((gown) => gown.id === params.gown);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>New rental</h1>
          <div className="page-sub">One screen. Nothing here is required except a name and a party date.</div>
        </div>
        <Link href="/" className="btn">
          Back to ledger
        </Link>
      </div>
      <div className="page">
        <RentalForm
          gowns={gowns}
          isEdit={false}
          pickupOffset={settingNumber(settings, "pickupOffsetDays", 2)}
          returnOffset={settingNumber(settings, "returnOffsetDays", 2)}
          defaults={{
            customerName: "",
            phone: "",
            email: "",
            writtenDate: toInputDay(today()),
            partyDate: "",
            pickupDate: "",
            returnDate: "",
            gownId: preselected?.id ?? "",
            gownText: "",
            price: preselected ? (preselected.priceCents / 100).toFixed(2) : "",
            paid: "",
            status: "BOOKED",
            notes: ""
          }}
        />
      </div>
    </>
  );
}
