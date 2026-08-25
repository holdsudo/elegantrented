import Link from "next/link";
import {
  listLiveRentalSummaries,
  listRentals,
  totalCollected,
  type LedgerQuery
} from "@/lib/queries";
import { addDays, formatDayShort, relativeDay, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSettings, settingNumber } from "@/lib/settings";
import {
  displayRentalNumber,
  gownLabel,
  isOverdue,
  paidTotalsByRental,
  paymentLabel,
  paymentState,
  statusLabel
} from "@/lib/rentals";
import { withBase } from "@/lib/base-path";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "month", label: "This month" },
  { key: "past", label: "Past" },
  { key: "balance", label: "Balance due" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All" }
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default async function LedgerPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ?? "upcoming") as FilterKey;

  const settings = await getSettings();
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const currency = settings.currency;
  const now = today();

  const listQuery: LedgerQuery = {
    search: query || undefined,
    order: filter === "upcoming" ? "asc" : "desc",
    limit: 300
  };

  if (filter === "upcoming") {
    listQuery.partyFrom = now;
    listQuery.excludeCancelled = true;
  } else if (filter === "month") {
    const start = new Date(`${now.toISOString().slice(0, 7)}-01T00:00:00.000Z`);
    listQuery.partyFrom = start;
    listQuery.partyBefore = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  } else if (filter === "past") {
    listQuery.partyBefore = now;
    listQuery.excludeCancelled = true;
  } else if (filter === "overdue") {
    listQuery.statuses = ["BOOKED", "OUT"];
    listQuery.partyThrough = addDays(now, returnOffset);
  }

  const rentals = await listRentals(listQuery);

  const paidTotals = await paidTotalsByRental(rentals.map((r) => r.id));

  const rows = rentals
    .map((rental) => {
      const paidCents = paidTotals.get(rental.id) ?? 0;
      return {
        ...rental,
        paidCents,
        balanceCents: rental.priceCents - paidCents,
        overdue: isOverdue(rental, returnOffset, now)
      };
    })
    .filter((row) => (filter === "overdue" ? row.overdue : true))
    .filter((row) => (filter === "balance" ? row.balanceCents > 0 && row.status !== "CANCELLED" : true));

  // Header numbers reflect the whole book, not the filtered view.
  const [liveRentals, collectedCents] = await Promise.all([
    listLiveRentalSummaries(),
    totalCollected()
  ]);

  const bookedCents = liveRentals.reduce((sum, r) => sum + r.priceCents, 0);
  const outstandingCents = bookedCents - collectedCents;
  const overdueCount = liveRentals.filter((r) => isOverdue(r, returnOffset, now)).length;
  const next7 = liveRentals.filter(
    (r) => r.partyDate >= now && r.partyDate <= addDays(now, 7)
  ).length;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Ledger</h1>
          <div className="page-sub">Every rental, one row. Sorted by party date.</div>
        </div>
        <Link href="/rentals/new" className="btn primary">
          Add rental
        </Link>
      </div>

      <div className="page">
        <div className="grid grid-4">
          <div className="card stat">
            <span className="stat-label">Parties in 7 days</span>
            <span className="stat-value">{next7}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Outstanding</span>
            <span className={outstandingCents > 0 ? "stat-value" : "stat-value good"}>
              {formatMoney(outstandingCents, currency)}
            </span>
            <Link href="/?filter=balance" className="stat-note">
              Who owes what →
            </Link>
          </div>
          <div className="card stat">
            <span className="stat-label">Overdue returns</span>
            <span className={overdueCount > 0 ? "stat-value alert" : "stat-value"}>{overdueCount}</span>
            {overdueCount > 0 ? (
              <Link href="/?filter=overdue" className="stat-note">
                See them →
              </Link>
            ) : (
              <span className="stat-note">Nothing out past due</span>
            )}
          </div>
          <div className="card stat">
            <span className="stat-label">Booked value</span>
            <span className="stat-value">{formatMoney(bookedCents, currency)}</span>
            <span className="stat-note">{liveRentals.length} rentals on the book</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <form className="search-bar" action={withBase("/")} method="get">
              <input type="hidden" name="filter" value={filter} />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Name, phone, gown # or description"
                aria-label="Search rentals"
              />
              <button type="submit" className="btn small">
                Search
              </button>
              {query ? (
                <Link href={`/?filter=${filter}`} className="btn small">
                  Clear
                </Link>
              ) : null}
            </form>
            <div className="filters">
              {FILTERS.map((option) => (
                <Link
                  key={option.key}
                  href={`/?filter=${option.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  className={option.key === filter ? "filter active" : "filter"}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="empty">
              <strong>Nothing here</strong>
              <span>
                {query
                  ? `No rental matches "${query}" in this view.`
                  : "No rentals match this filter yet."}
              </span>
              <Link href="/rentals/new" className="btn primary small">
                Add a rental
              </Link>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th className="mono">R-#</th>
                    <th>Name</th>
                    <th className="mono">Phone</th>
                    <th className="mono">Date</th>
                    <th className="mono">Party</th>
                    <th>Gown</th>
                    <th className="num">Price</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const pay = paymentState(row.priceCents, row.paidCents);
                    return (
                      <tr key={row.id}>
                        <td className="mono">{row.number}</td>
                        <td>
                          <Link href={`/rentals/${row.id}`} className="row-link">
                            {row.customerName}
                          </Link>
                          {row.customerId ? (
                            <Link href={`/customers/${row.customerId}`} className="cell-sub">
                              their history →
                            </Link>
                          ) : null}
                        </td>
                        <td className="mono">{row.phone || "—"}</td>
                        <td className="mono">{formatDayShort(row.writtenDate)}</td>
                        <td className="mono">
                          {formatDayShort(row.partyDate)}
                          <span className="cell-sub">{relativeDay(row.partyDate, now)}</span>
                        </td>
                        <td>{gownLabel(row.gown, row.gownText)}</td>
                        <td className="num">{formatMoney(row.priceCents, currency)}</td>
                        <td className="num">{formatMoney(row.paidCents, currency)}</td>
                        <td className="num">
                          <span
                            className={
                              row.balanceCents > 0 ? "pill warn" : "pill good"
                            }
                          >
                            {formatMoney(row.balanceCents, currency)}
                          </span>
                        </td>
                        <td>
                          {row.overdue ? (
                            <span className="pill bad">Overdue</span>
                          ) : row.status === "CANCELLED" ? (
                            <span className="pill">Cancelled</span>
                          ) : (
                            <span className="pill">{statusLabel(row.status)}</span>
                          )}
                          <span className="cell-sub">{paymentLabel(pay)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="row tiny muted">
          <span>
            Showing {rows.length} rental{rows.length === 1 ? "" : "s"}
          </span>
          <span className="spacer" />
          <a className="btn small" href={`/api/export?filter=${filter}&q=${encodeURIComponent(query)}`}>
            Export CSV
          </a>
        </div>
      </div>
    </>
  );
}
