import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import {
  listCustomerRollups,
  listGownRollups,
  revenueByMonth,
  rentalsByMonth
} from "@/lib/queries";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, (month ?? 1) - 1, 1)));
}

export default async function ReportsPage() {
  await requireUser();

  const settings = await getSettings();
  const currency = settings.currency;

  const [gowns, customers, revenue, volume] = await Promise.all([
    listGownRollups(),
    listCustomerRollups(),
    revenueByMonth(12),
    rentalsByMonth(12)
  ]);

  const earners = [...gowns].sort((a, b) => b.earnedCents - a.earnedCents);
  const idle = [...gowns]
    .filter((gown) => gown.condition !== "RETIRED")
    .sort((a, b) => {
      const aLast = a.lastRented?.getTime() ?? 0;
      const bLast = b.lastRented?.getTime() ?? 0;
      return aLast - bLast;
    })
    .slice(0, 8);

  const totalEarned = gowns.reduce((sum, gown) => sum + gown.earnedCents, 0);
  const totalCost = gowns.reduce((sum, gown) => sum + gown.costCents, 0);
  const totalRentals = gowns.reduce((sum, gown) => sum + gown.timesRented, 0);
  const peakRevenue = Math.max(1, ...revenue.map((row) => Number(row.collected ?? 0)));

  const topCustomers = customers.slice(0, 8);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Reports</h1>
          <div className="page-sub">Where the money comes from, and which gowns earn it.</div>
        </div>
      </div>

      <div className="page">
        <div className="grid grid-4">
          <div className="card stat">
            <span className="stat-label">Collected, all time</span>
            <span className="stat-value good">{formatMoney(totalEarned, currency)}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Rentals, all time</span>
            <span className="stat-value">{totalRentals}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Stock invested</span>
            <span className="stat-value">{formatMoney(totalCost, currency)}</span>
            <span className="stat-note">
              {totalCost > 0
                ? `${Math.round((totalEarned / totalCost) * 100)}% returned`
                : "Add costs on each gown"}
            </span>
          </div>
          <div className="card stat">
            <span className="stat-label">Average rental</span>
            <span className="stat-value">
              {formatMoney(totalRentals ? Math.round(totalEarned / totalRentals) : 0, currency)}
            </span>
          </div>
        </div>

        <div className="card card-pad stack">
          <h2>Collected by month</h2>
          {revenue.length === 0 ? (
            <p className="tiny muted" style={{ margin: 0 }}>
              No payments recorded yet.
            </p>
          ) : (
            <div className="chart-stack">
              {revenue.map((row) => {
                const rentals = volume.find((entry) => entry.month === row.month);
                return (
                  <div key={row.month} className="chart-row">
                    <div className="chart-label">{monthLabel(row.month)}</div>
                    <div className="chart-bar-track">
                      <div
                        className="chart-bar-fill"
                        style={{ width: `${(Number(row.collected ?? 0) / peakRevenue) * 100}%` }}
                      />
                    </div>
                    <div className="chart-value">
                      {formatMoney(Number(row.collected ?? 0), currency)}
                      <span className="cell-sub">
                        {rentals ? `${rentals.rentals} rental${rentals.rentals === 1 ? "" : "s"}` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Every gown, by what it has earned</h2>
            <span className="tiny muted">Collected, not merely booked</span>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th className="mono">#</th>
                  <th>Gown</th>
                  <th className="num">Times out</th>
                  <th className="num">Earned</th>
                  <th className="num">Average</th>
                  <th className="num">Cost</th>
                  <th className="num">Returned</th>
                </tr>
              </thead>
              <tbody>
                {earners.map((gown) => {
                  const average = gown.timesRented
                    ? Math.round(gown.bookedCents / gown.timesRented)
                    : 0;
                  const returned = gown.costCents > 0 ? gown.earnedCents / gown.costCents : null;
                  return (
                    <tr key={gown.id}>
                      <td className="mono">{gown.number}</td>
                      <td>
                        <Link href={`/gowns/${gown.id}`} className="row-link">
                          {gown.description}
                        </Link>
                        <span className="cell-sub">
                          {[gown.size ? `Size ${gown.size}` : null, gown.color]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      <td className="num">{gown.timesRented}</td>
                      <td className="num">{formatMoney(gown.earnedCents, currency)}</td>
                      <td className="num">{formatMoney(average, currency)}</td>
                      <td className="num">
                        {gown.costCents > 0 ? formatMoney(gown.costCents, currency) : "—"}
                      </td>
                      <td className="num">
                        {returned == null ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className={returned >= 1 ? "pill good" : "pill warn"}>
                            {Math.round(returned * 100)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head">
              <h2>Best customers</h2>
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="num">Rentals</th>
                    <th className="num">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <Link href={`/customers/${customer.id}`} className="row-link">
                          {customer.name}
                        </Link>
                      </td>
                      <td className="num">{customer.rentals}</td>
                      <td className="num">{formatMoney(customer.spentCents, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Sitting idle</h2>
              <span className="tiny muted">Longest since last worn</span>
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th className="mono">#</th>
                    <th>Gown</th>
                    <th className="num">Times out</th>
                  </tr>
                </thead>
                <tbody>
                  {idle.map((gown) => (
                    <tr key={gown.id}>
                      <td className="mono">{gown.number}</td>
                      <td>
                        <Link href={`/gowns/${gown.id}`} className="row-link">
                          {gown.description}
                        </Link>
                        <span className="cell-sub">
                          {gown.lastRented
                            ? `Last out ${gown.lastRented.toISOString().slice(0, 10)}`
                            : "Never rented"}
                        </span>
                      </td>
                      <td className="num">{gown.timesRented}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
