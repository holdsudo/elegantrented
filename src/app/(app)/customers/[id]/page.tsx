import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { daysBetween, formatDay, formatDayShort, relativeDay, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSettings, settingNumber } from "@/lib/settings";
import { displayRentalNumber, gownLabel, isOverdue, paidTotalsByRental } from "@/lib/rentals";
import { statusLabel } from "@/lib/enums";
import { getCustomer, listRentalsForCustomer } from "@/lib/queries";
import { saveCustomerNotesAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  return { title: customer ? customer.name : "Customer" };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const customer = await getCustomer(id);
  if (!customer) notFound();

  const settings = await getSettings();
  const currency = settings.currency;
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const now = today();

  const rentals = await listRentalsForCustomer(id);
  const paid = await paidTotalsByRental(rentals.map((rental) => rental.id));

  const live = rentals.filter((rental) => rental.status !== "CANCELLED");
  const bookedCents = live.reduce((sum, rental) => sum + rental.priceCents, 0);
  const spentCents = live.reduce((sum, rental) => sum + (paid.get(rental.id) ?? 0), 0);
  const balanceCents = bookedCents - spentCents;
  const averageCents = live.length ? Math.round(bookedCents / live.length) : 0;

  const past = live.filter((rental) => rental.partyDate < now);
  const upcoming = live.filter((rental) => rental.partyDate >= now);
  const overdue = live.filter((rental) => isOverdue(rental, returnOffset, now));

  const firstParty = live.length ? live[live.length - 1].partyDate : null;
  const sinceFirst = firstParty ? Math.abs(daysBetween(firstParty, now)) : 0;

  // Which gowns this person keeps coming back to.
  const gownTally = new Map<string, { label: string; id: string | null; times: number }>();
  for (const rental of live) {
    const key = rental.gown?.id ?? rental.gownText ?? "—";
    const entry = gownTally.get(key) ?? {
      label: gownLabel(rental.gown, rental.gownText),
      id: rental.gown?.id ?? null,
      times: 0
    };
    entry.times += 1;
    gownTally.set(key, entry);
  }
  const favourites = Array.from(gownTally.values()).sort((a, b) => b.times - a.times);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="row-tight">
            <h1>{customer.name}</h1>
            {live.length > 1 ? <span className="pill brand">Returning</span> : null}
            {balanceCents > 0 ? (
              <span className="pill warn">{formatMoney(balanceCents, currency)} owing</span>
            ) : null}
            {overdue.length > 0 ? <span className="pill bad">{overdue.length} overdue</span> : null}
          </div>
          <div className="page-sub">
            {customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : "No phone"}
            {customer.email ? (
              <>
                {" · "}
                <a href={`mailto:${customer.email}`}>{customer.email}</a>
              </>
            ) : null}
          </div>
        </div>
        <div className="row-tight">
          <Link href="/customers" className="btn">
            All customers
          </Link>
        </div>
      </div>

      <div className="page">
        <div className="grid grid-4">
          <div className="card stat">
            <span className="stat-label">Rentals</span>
            <span className="stat-value">{live.length}</span>
            <span className="stat-note">
              {past.length} past · {upcoming.length} upcoming
            </span>
          </div>
          <div className="card stat">
            <span className="stat-label">Lifetime value</span>
            <span className="stat-value good">{formatMoney(spentCents, currency)}</span>
            <span className="stat-note">{formatMoney(averageCents, currency)} average</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Balance</span>
            <span className={balanceCents > 0 ? "stat-value alert" : "stat-value"}>
              {formatMoney(balanceCents, currency)}
            </span>
          </div>
          <div className="card stat">
            <span className="stat-label">Customer since</span>
            <span className="stat-value">
              {firstParty ? formatDay(firstParty).split(",")[1]?.trim() ?? "—" : "—"}
            </span>
            <span className="stat-note">
              {firstParty ? `${Math.round(sinceFirst / 30)} months` : "No rentals yet"}
            </span>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card card-pad stack">
            <h2>Notes</h2>
            <form action={saveCustomerNotesAction} className="stack">
              <input type="hidden" name="customerId" value={customer.id} />
              <div className="field">
                <textarea
                  name="notes"
                  aria-label="Customer notes"
                  defaultValue={customer.notes ?? ""}
                  placeholder="Sizes that fit, alterations she likes, who referred her, anything worth remembering next time"
                />
              </div>
              <div className="row">
                <button type="submit" className="btn small primary">
                  Save notes
                </button>
              </div>
            </form>
          </div>

          <div className="card card-pad stack">
            <h2>Gowns worn</h2>
            {favourites.length === 0 ? (
              <p className="tiny muted" style={{ margin: 0 }}>
                Nothing yet.
              </p>
            ) : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
                {favourites.map((entry) => (
                  <li key={entry.label} className="row" style={{ justifyContent: "space-between" }}>
                    <span>
                      {entry.id ? (
                        <Link href={`/gowns/${entry.id}`}>{entry.label}</Link>
                      ) : (
                        entry.label
                      )}
                    </span>
                    <span className="pill">
                      {entry.times}
                      {entry.times === 1 ? " time" : " times"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Every rental</h2>
            <span className="tiny muted">Newest first</span>
          </div>
          {rentals.length === 0 ? (
            <div className="empty">
              <strong>No rentals yet</strong>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th className="mono">R-#</th>
                    <th className="mono">Party</th>
                    <th>Gown</th>
                    <th className="num">Price</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rentals.map((rental) => {
                    const paidCents = paid.get(rental.id) ?? 0;
                    const balance = rental.priceCents - paidCents;
                    return (
                      <tr key={rental.id}>
                        <td className="mono">
                          <Link href={`/rentals/${rental.id}`} className="row-link">
                            {displayRentalNumber(rental.number)}
                          </Link>
                        </td>
                        <td className="mono">
                          {formatDayShort(rental.partyDate)}
                          <span className="cell-sub">
                            {formatDay(rental.partyDate).slice(-4)} ·{" "}
                            {relativeDay(rental.partyDate, now)}
                          </span>
                        </td>
                        <td>{gownLabel(rental.gown, rental.gownText)}</td>
                        <td className="num">{formatMoney(rental.priceCents, currency)}</td>
                        <td className="num">{formatMoney(paidCents, currency)}</td>
                        <td className="num">
                          {balance > 0 && rental.status !== "CANCELLED" ? (
                            <span className="pill warn">{formatMoney(balance, currency)}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {isOverdue(rental, returnOffset, now) ? (
                            <span className="pill bad">Overdue</span>
                          ) : (
                            <span className="pill">{statusLabel(rental.status)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
