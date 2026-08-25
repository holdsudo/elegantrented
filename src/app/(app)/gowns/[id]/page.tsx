import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { daysBetween, formatDay, formatDayShort, relativeDay, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSettings, settingNumber } from "@/lib/settings";
import { paidTotalsByRental, occupiedWindow } from "@/lib/rentals";
import { conditionLabel, statusLabel } from "@/lib/enums";
import {
  customersForGown,
  getGownRollup,
  listGownPhotos,
  listRentalsForGown
} from "@/lib/queries";
import { deleteGownAction, deletePhotoAction } from "../actions";
import { withBase } from "@/lib/base-path";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gown = await getGownRollup(id);
  return { title: gown ? `#${gown.number} — ${gown.description}` : "Gown" };
}

export default async function GownDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const gown = await getGownRollup(id);
  if (!gown) notFound();

  const settings = await getSettings();
  const currency = settings.currency;
  const pickupOffset = settingNumber(settings, "pickupOffsetDays", 2);
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const now = today();

  const [photos, rentals, wearers] = await Promise.all([
    listGownPhotos(id),
    listRentalsForGown(id),
    customersForGown(id)
  ]);

  const paid = await paidTotalsByRental(rentals.map((rental) => rental.id));
  const live = rentals.filter((rental) => rental.status !== "CANCELLED");

  const averageCents = gown.timesRented ? Math.round(gown.bookedCents / gown.timesRented) : 0;
  const outstandingCents = gown.bookedCents - gown.earnedCents;

  // Payback, only when we know what it cost.
  const paidBack = gown.costCents > 0 ? gown.earnedCents / gown.costCents : null;
  const rentalsToBreakEven =
    gown.costCents > 0 && averageCents > 0
      ? Math.max(0, Math.ceil((gown.costCents - gown.earnedCents) / averageCents))
      : null;

  // Days in service, and how many of them it actually spent out.
  const inServiceSince = gown.acquiredOn ?? gown.firstRented;
  const daysOwned = inServiceSince ? Math.max(1, daysBetween(inServiceSince, now)) : null;
  const daysOut = live.reduce((sum, rental) => {
    const window = occupiedWindow(rental, pickupOffset, returnOffset);
    return sum + Math.max(1, daysBetween(window.from, window.to));
  }, 0);
  const utilisation = daysOwned ? Math.min(100, Math.round((daysOut / daysOwned) * 100)) : null;

  // Earnings per calendar year, so a trend is visible at a glance.
  const byYear = new Map<string, { rentals: number; earned: number }>();
  for (const rental of live) {
    const year = String(rental.partyDate.getUTCFullYear());
    const entry = byYear.get(year) ?? { rentals: 0, earned: 0 };
    entry.rentals += 1;
    entry.earned += paid.get(rental.id) ?? 0;
    byYear.set(year, entry);
  }
  const years = Array.from(byYear.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  const peakYear = Math.max(1, ...years.map(([, value]) => value.earned));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="row-tight">
            <h1>#{gown.number}</h1>
            <span className="pill">{conditionLabel(gown.condition)}</span>
            {gown.published ? (
              <span className="pill good">On the website</span>
            ) : (
              <span className="pill">Hidden</span>
            )}
          </div>
          <div className="page-sub">
            {[gown.description, gown.size ? `size ${gown.size}` : null, gown.color]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="row-tight">
          <Link href={`/rentals/new?gown=${gown.id}`} className="btn primary">
            Book this gown
          </Link>
          <Link href={`/gowns/${gown.id}/edit`} className="btn">
            Edit
          </Link>
        </div>
      </div>

      <div className="page">
        <div className="grid grid-4">
          <div className="card stat">
            <span className="stat-label">Times rented</span>
            <span className="stat-value">{gown.timesRented}</span>
            <span className="stat-note">
              {gown.upcoming} upcoming
              {gown.cancelled > 0 ? ` · ${gown.cancelled} cancelled` : ""}
            </span>
          </div>
          <div className="card stat">
            <span className="stat-label">Earned</span>
            <span className="stat-value good">{formatMoney(gown.earnedCents, currency)}</span>
            <span className="stat-note">
              {outstandingCents > 0
                ? `${formatMoney(outstandingCents, currency)} still owed`
                : "All collected"}
            </span>
          </div>
          <div className="card stat">
            <span className="stat-label">Average rental</span>
            <span className="stat-value">{formatMoney(averageCents, currency)}</span>
            <span className="stat-note">
              List price {formatMoney(gown.priceCents, currency)}
            </span>
          </div>
          <div className="card stat">
            <span className="stat-label">Paid for itself</span>
            {paidBack == null ? (
              <>
                <span className="stat-value">—</span>
                <span className="stat-note">Add what it cost, in Edit</span>
              </>
            ) : (
              <>
                <span className={paidBack >= 1 ? "stat-value good" : "stat-value"}>
                  {Math.round(paidBack * 100)}%
                </span>
                <span className="stat-note">
                  {paidBack >= 1
                    ? `Clear by ${formatMoney(gown.earnedCents - gown.costCents, currency)}`
                    : rentalsToBreakEven != null
                      ? `${rentalsToBreakEven} more rental${rentalsToBreakEven === 1 ? "" : "s"} to break even`
                      : `Cost ${formatMoney(gown.costCents, currency)}`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card card-pad stack">
            <h2>Background</h2>
            <dl className="stack" style={{ margin: 0, gap: 10 }}>
              <Row label="Gown #" value={gown.number} mono />
              <Row label="Description" value={gown.description} />
              <Row label="Size" value={gown.size || "—"} />
              <Row label="Colour" value={gown.color || "—"} />
              <Row label="Condition" value={conditionLabel(gown.condition)} />
              <Row
                label="Acquired"
                value={gown.acquiredOn ? formatDay(gown.acquiredOn) : "Not recorded"}
              />
              <Row
                label="Cost"
                value={gown.costCents > 0 ? formatMoney(gown.costCents, currency) : "Not recorded"}
              />
              <Row
                label="In service"
                value={daysOwned ? `${Math.round(daysOwned / 30)} months` : "—"}
              />
              <Row
                label="First rented"
                value={gown.firstRented ? formatDay(gown.firstRented) : "Never"}
              />
              <Row
                label="Last rented"
                value={
                  gown.lastRented
                    ? `${formatDay(gown.lastRented)} · ${relativeDay(gown.lastRented, now)}`
                    : "Never"
                }
              />
              <Row label="Different customers" value={String(gown.distinctCustomers)} />
              <Row
                label="Days out"
                value={
                  utilisation != null
                    ? `${daysOut} of ${daysOwned} · ${utilisation}%`
                    : `${daysOut}`
                }
              />
            </dl>
          </div>

          <div className="stack">
            {years.length > 0 ? (
              <div className="card card-pad stack">
                <h2>By year</h2>
                <div className="chart-stack">
                  {years.map(([year, value]) => (
                    <div key={year} className="chart-row">
                      <div className="chart-label">{year}</div>
                      <div className="chart-bar-track">
                        <div
                          className="chart-bar-fill"
                          style={{ width: `${(value.earned / peakYear) * 100}%` }}
                        />
                      </div>
                      <div className="chart-value">
                        {formatMoney(value.earned, currency)}
                        <span className="cell-sub">
                          {value.rentals} rental{value.rentals === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {wearers.length > 0 ? (
              <div className="card card-pad stack">
                <h2>Who has worn it</h2>
                <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
                  {wearers.map((wearer) => (
                    <li key={wearer.id} className="row" style={{ justifyContent: "space-between" }}>
                      <Link href={`/customers/${wearer.id}`}>{wearer.name}</Link>
                      <span className="row-tight">
                        <span className="pill">
                          {wearer.times}
                          {wearer.times === 1 ? " time" : " times"}
                        </span>
                        <span className="tiny muted">
                          {formatMoney(Number(wearer.spent ?? 0), currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        {photos.length > 0 ? (
          <div className="card card-pad stack">
            <h2>Photos</h2>
            <div className="photo-strip">
              {photos.map((photo) => (
                <figure key={photo.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={withBase(`/api/photos/${photo.id}`)} alt={gown.description} />
                  <form action={deletePhotoAction}>
                    <input type="hidden" name="photoId" value={photo.id} />
                    <input type="hidden" name="gownId" value={gown.id} />
                    <button type="submit" className="btn small danger" style={{ width: "100%" }}>
                      Remove
                    </button>
                  </form>
                </figure>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="card-head">
            <h2>Every time it has gone out</h2>
            <span className="tiny muted">
              {rentals.length} record{rentals.length === 1 ? "" : "s"}, newest first
            </span>
          </div>
          {rentals.length === 0 ? (
            <div className="empty">
              <strong>Never rented yet</strong>
              <Link href={`/rentals/new?gown=${gown.id}`} className="btn primary small">
                Book it
              </Link>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th className="mono">R-#</th>
                    <th>Customer</th>
                    <th className="mono">Party</th>
                    <th className="num">Price</th>
                    <th className="num">Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rentals.map((rental) => (
                    <tr key={rental.id}>
                      <td className="mono">
                        <Link href={`/rentals/${rental.id}`} className="row-link">
                          R-{rental.number}
                        </Link>
                      </td>
                      <td>
                        {rental.customerId ? (
                          <Link href={`/customers/${rental.customerId}`} className="row-link">
                            {rental.customerName}
                          </Link>
                        ) : (
                          rental.customerName
                        )}
                      </td>
                      <td className="mono">
                        {formatDayShort(rental.partyDate)}
                        <span className="cell-sub">{formatDay(rental.partyDate).slice(-4)}</span>
                      </td>
                      <td className="num">{formatMoney(rental.priceCents, currency)}</td>
                      <td className="num">{formatMoney(paid.get(rental.id) ?? 0, currency)}</td>
                      <td>
                        <span className="pill">{statusLabel(rental.status)}</span>
                        {rental.partyDate >= now ? (
                          <span className="cell-sub">{relativeDay(rental.partyDate, now)}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form action={deleteGownAction} className="row">
          <input type="hidden" name="gownId" value={gown.id} />
          <button type="submit" className="btn small danger">
            Delete this gown
          </button>
          <span className="tiny muted">
            Past rentals keep their history — they just stop pointing at a gown record. Marking it
            Retired is usually better.
          </span>
        </form>
      </div>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
      <dt className="stat-label" style={{ minWidth: 140 }}>
        {label}
      </dt>
      <dd className={mono ? "mono" : undefined} style={{ margin: 0, fontWeight: 550 }}>
        {value}
      </dd>
    </div>
  );
}
