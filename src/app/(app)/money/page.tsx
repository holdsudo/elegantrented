import Link from "next/link";
import { listRecentPayments, listRentals } from "@/lib/queries";
import { formatDay, formatDayShort, relativeDay, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { displayRentalNumber, gownLabel, paidTotalsByRental } from "@/lib/rentals";

export const metadata = { title: "Money" };
export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  const settings = await getSettings();
  const currency = settings.currency;
  const now = today();

  const rentals = await listRentals({ excludeCancelled: true });

  const paidTotals = await paidTotalsByRental(rentals.map((rental) => rental.id));

  const rows = rentals
    .map((rental) => {
      const paidCents = paidTotals.get(rental.id) ?? 0;
      return { ...rental, paidCents, balanceCents: rental.priceCents - paidCents };
    })
    .filter((row) => row.balanceCents > 0)
    .sort((a, b) => a.partyDate.getTime() - b.partyDate.getTime());

  const outstandingCents = rows.reduce((sum, row) => sum + row.balanceCents, 0);
  const bookedCents = rentals.reduce((sum, rental) => sum + rental.priceCents, 0);
  const collectedCents = rentals.reduce(
    (sum, rental) => sum + (paidTotals.get(rental.id) ?? 0),
    0
  );

  const recentPayments = await listRecentPayments(15);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Money</h1>
          <div className="page-sub">Who owes what, soonest party first.</div>
        </div>
      </div>

      <div className="page">
        <div className="grid grid-3">
          <div className="card stat">
            <span className="stat-label">Outstanding</span>
            <span className={outstandingCents > 0 ? "stat-value alert" : "stat-value good"}>
              {formatMoney(outstandingCents, currency)}
            </span>
            <span className="stat-note">
              across {rows.length} rental{rows.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="card stat">
            <span className="stat-label">Collected</span>
            <span className="stat-value good">{formatMoney(collectedCents, currency)}</span>
            <span className="stat-note">all time</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Booked value</span>
            <span className="stat-value">{formatMoney(bookedCents, currency)}</span>
            <span className="stat-note">{rentals.length} live rentals</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Balances due</h2>
          </div>
          {rows.length === 0 ? (
            <div className="empty">
              <strong>Nothing outstanding</strong>
              <span>Every live rental is paid in full.</span>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th className="mono">R-#</th>
                    <th>Name</th>
                    <th className="mono">Phone</th>
                    <th className="mono">Party</th>
                    <th>Gown</th>
                    <th className="num">Price</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{displayRentalNumber(row.number)}</td>
                      <td>
                        <Link href={`/rentals/${row.id}`} className="row-link">
                          {row.customerName}
                        </Link>
                      </td>
                      <td className="mono">{row.phone || "—"}</td>
                      <td className="mono">
                        {formatDayShort(row.partyDate)}
                        <span className="cell-sub">{relativeDay(row.partyDate, now)}</span>
                      </td>
                      <td>{gownLabel(row.gown, row.gownText)}</td>
                      <td className="num">{formatMoney(row.priceCents, currency)}</td>
                      <td className="num">{formatMoney(row.paidCents, currency)}</td>
                      <td className="num">
                        <span className="pill warn">{formatMoney(row.balanceCents, currency)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} className="num">
                      <strong>Total outstanding</strong>
                    </td>
                    <td className="num">
                      <strong>{formatMoney(outstandingCents, currency)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {recentPayments.length > 0 ? (
          <div className="card">
            <div className="card-head">
              <h2>Recent payments</h2>
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th className="mono">Date</th>
                    <th>Name</th>
                    <th>Method</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="mono">{formatDay(payment.paidOn)}</td>
                      <td>
                        <Link href={`/rentals/${payment.rental.id}`} className="row-link">
                          {payment.rental.customerName}
                        </Link>
                        <span className="cell-sub">{displayRentalNumber(payment.rental.number)}</span>
                      </td>
                      <td>{payment.method}</td>
                      <td className="num">{formatMoney(payment.amountCents, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
