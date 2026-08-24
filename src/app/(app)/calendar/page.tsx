import Link from "next/link";
import { listRentals } from "@/lib/queries";
import { addDays, today } from "@/lib/dates";
import { getSettings, settingNumber } from "@/lib/settings";
import { gownLabel } from "@/lib/rentals";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return monthKey(date);
}

export default async function CalendarPage({
  searchParams
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const params = await searchParams;
  const now = today();
  const key = /^\d{4}-\d{2}$/.test(params.m ?? "") ? (params.m as string) : monthKey(now);

  const [year, month] = key.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  // Pad out to whole weeks so the grid is always rectangular.
  const gridStart = addDays(first, -first.getUTCDay());
  const gridEnd = addDays(next, (7 - next.getUTCDay()) % 7);

  const settings = await getSettings();
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const pickupOffset = settingNumber(settings, "pickupOffsetDays", 2);

  const rentals = await listRentals({
    excludeCancelled: true,
    partyFrom: addDays(gridStart, -(pickupOffset + returnOffset + 7)),
    partyThrough: addDays(gridEnd, pickupOffset + returnOffset + 7)
  });

  type Marker = { id: string; label: string; kind: "party" | "pickup" | "ret" };
  const byDay = new Map<string, Marker[]>();

  function push(date: Date, marker: Marker) {
    const dayKey = date.toISOString().slice(0, 10);
    const list = byDay.get(dayKey);
    if (list) list.push(marker);
    else byDay.set(dayKey, [marker]);
  }

  for (const rental of rentals) {
    push(rental.partyDate, {
      id: rental.id,
      kind: "party",
      label: rental.customerName
    });
    const pickup = rental.pickupDate ?? addDays(rental.partyDate, -pickupOffset);
    const back = rental.returnDate ?? addDays(rental.partyDate, returnOffset);
    push(pickup, { id: rental.id, kind: "pickup", label: `↑ ${rental.customerName}` });
    push(back, { id: rental.id, kind: "ret", label: `↓ ${rental.customerName}` });
  }

  const days: Date[] = [];
  for (let cursor = gridStart; cursor < gridEnd; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(first);

  const monthRentals = rentals.filter(
    (rental) => rental.partyDate >= first && rental.partyDate < next
  );

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{monthLabel}</h1>
          <div className="page-sub">
            {monthRentals.length} part{monthRentals.length === 1 ? "y" : "ies"} this month · ↑ pickup ·
            ↓ return
          </div>
        </div>
        <div className="row-tight">
          <Link href={`/calendar?m=${shiftMonth(key, -1)}`} className="btn small">
            ← Prev
          </Link>
          <Link href="/calendar" className="btn small">
            Today
          </Link>
          <Link href={`/calendar?m=${shiftMonth(key, 1)}`} className="btn small">
            Next →
          </Link>
        </div>
      </div>

      <div className="page">
        <div className="cal">
          {DOW.map((label) => (
            <div key={label} className="cal-dow">
              {label}
            </div>
          ))}
          {days.map((day) => {
            const dayKey = day.toISOString().slice(0, 10);
            const outside = day < first || day >= next;
            const isToday = dayKey === now.toISOString().slice(0, 10);
            const markers = byDay.get(dayKey) ?? [];

            return (
              <div
                key={dayKey}
                className={`cal-day${outside ? " outside" : ""}${isToday ? " today" : ""}`}
              >
                <span className="cal-date">{day.getUTCDate()}</span>
                {markers.slice(0, 4).map((marker, index) => (
                  <Link
                    key={`${marker.id}-${marker.kind}-${index}`}
                    href={`/rentals/${marker.id}`}
                    className={`cal-event ${marker.kind === "party" ? "" : marker.kind}`}
                    title={marker.label}
                  >
                    {marker.label}
                  </Link>
                ))}
                {markers.length > 4 ? (
                  <span className="tiny muted">+{markers.length - 4} more</span>
                ) : null}
              </div>
            );
          })}
        </div>

        {monthRentals.length > 0 ? (
          <div className="card">
            <div className="card-head">
              <h2>Parties this month</h2>
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th className="mono">Party</th>
                    <th>Name</th>
                    <th>Gown</th>
                    <th className="mono">Pickup</th>
                    <th className="mono">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRentals.map((rental) => (
                    <tr key={rental.id}>
                      <td className="mono">
                        {new Intl.DateTimeFormat("en-US", {
                          weekday: "short",
                          day: "numeric",
                          timeZone: "UTC"
                        }).format(rental.partyDate)}
                      </td>
                      <td>
                        <Link href={`/rentals/${rental.id}`} className="row-link">
                          {rental.customerName}
                        </Link>
                      </td>
                      <td>{gownLabel(rental.gown, rental.gownText)}</td>
                      <td className="mono">
                        {(rental.pickupDate ?? addDays(rental.partyDate, -pickupOffset))
                          .toISOString()
                          .slice(5, 10)}
                      </td>
                      <td className="mono">
                        {(rental.returnDate ?? addDays(rental.partyDate, returnOffset))
                          .toISOString()
                          .slice(5, 10)}
                      </td>
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
