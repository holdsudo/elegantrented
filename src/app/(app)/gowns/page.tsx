import Link from "next/link";
import { firstPhotoIds, listGowns, liveRentalsByGown } from "@/lib/queries";
import { addDays, formatDayShort, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSettings, settingNumber } from "@/lib/settings";
import { occupiedWindow } from "@/lib/rentals";

export const metadata = { title: "Gowns" };
export const dynamic = "force-dynamic";

export default async function GownsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();

  const settings = await getSettings();
  const pickupOffset = settingNumber(settings, "pickupOffsetDays", 2);
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const now = today();

  const gowns = await listGowns(query || undefined);
  const [thumbnails, rentalsByGown] = await Promise.all([
    firstPhotoIds(gowns.map((gown) => gown.id)),
    liveRentalsByGown()
  ]);

  gowns.sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: "base" })
  );

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Gowns</h1>
          <div className="page-sub">
            {gowns.length} gown{gowns.length === 1 ? "" : "s"} — numbered, so the ledger can check itself.
          </div>
        </div>
        <Link href="/gowns/new" className="btn primary">
          Add gown
        </Link>
      </div>

      <div className="page">
        <form className="search-bar" action="/gowns" method="get">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Gown #, description, color or size"
            aria-label="Search gowns"
          />
          <button type="submit" className="btn small">
            Search
          </button>
          {query ? (
            <Link href="/gowns" className="btn small">
              Clear
            </Link>
          ) : null}
        </form>

        {gowns.length === 0 ? (
          <div className="card empty">
            <strong>No gowns yet</strong>
            <span>
              Add them as you go — a rental can also just carry a typed description until then.
            </span>
            <Link href="/gowns/new" className="btn primary small">
              Add the first gown
            </Link>
          </div>
        ) : (
          <div className="gown-grid">
            {gowns.map((gown) => {
              const gownRentals = rentalsByGown.get(gown.id) ?? [];
              const thumbnailId = thumbnails.get(gown.id);
              const out = gownRentals.find((rental) => {
                const window = occupiedWindow(rental, pickupOffset, returnOffset);
                return window.from <= now && window.to >= now;
              });
              const overdue = gownRentals.find((rental) => {
                const due = rental.returnDate ?? addDays(rental.partyDate, returnOffset);
                return due < now;
              });
              const next = gownRentals.find((rental) => rental.partyDate >= now);

              return (
                <Link key={gown.id} href={`/gowns/${gown.id}`} className="gown-card">
                  <div className="gown-thumb">
                    {thumbnailId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/photos/${thumbnailId}`} alt={gown.description} />
                    ) : (
                      <span className="placeholder">#{gown.number}</span>
                    )}
                  </div>
                  <div className="gown-body">
                    <span className="gown-number">#{gown.number}</span>
                    <span className="gown-desc">{gown.description}</span>
                    <span className="gown-meta">
                      {[gown.size ? `Size ${gown.size}` : null, gown.color, formatMoney(gown.priceCents, settings.currency)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="row-tight" style={{ marginTop: 2 }}>
                      {overdue ? (
                        <span className="pill bad">Due back</span>
                      ) : out ? (
                        <span className="pill brand">Out</span>
                      ) : gown.condition === "RETIRED" ? (
                        <span className="pill">Retired</span>
                      ) : (
                        <span className="pill good">In</span>
                      )}
                      {next ? (
                        <span className="pill">Next {formatDayShort(next.partyDate)}</span>
                      ) : null}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
