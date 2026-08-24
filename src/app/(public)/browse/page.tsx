import Link from "next/link";
import { addDays, formatDay, parseDay, toInputDay, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSettings, settingNumber } from "@/lib/settings";
import { firstPhotoIds, listPublicGowns, pendingRequestCounts, takenGownIds } from "@/lib/queries";
import { JsonLd, breadcrumbSchema, collectionSchema } from "@/lib/schema-org";
import { EnterAtelier } from "@/components/showroom/enter-atelier";
import type { ShowroomGown } from "@/components/showroom/atelier";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const settings = await getSettings();
  return {
    title: "The Collection",
    description: `Browse every gown available to rent from ${settings.brandName}. Choose your date, see what's free, and reserve by request — each booking confirmed personally.`,
    alternates: { canonical: "/browse" },
    openGraph: {
      title: `The Collection · ${settings.brandName}`,
      description: `Every gown available to rent from ${settings.brandName}.`,
      url: "/browse",
      type: "website",
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: `${settings.brandName} — the collection` }]
    }
  };
}

const STEPS = [
  {
    title: "Choose your date",
    body: "Tell us when your evening is. We show only what is genuinely free that weekend — pickup and return included."
  },
  {
    title: "Request the gown",
    body: "Send it through in a moment. Nothing is held yet, and we say so plainly rather than letting you assume."
  },
  {
    title: "We confirm, personally",
    body: "A real conversation, usually the same day. The gown becomes yours the moment we say yes — not before."
  }
];

export default async function BrowsePage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; size?: string }>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const pickupOffset = settingNumber(settings, "pickupOffsetDays", 2);
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);

  const partyDate = parseDay(params.date);
  const size = (params.size ?? "").trim();

  const [gowns, pending] = await Promise.all([listPublicGowns(), pendingRequestCounts()]);

  // Only when a date is chosen do we work out what's already spoken for. The
  // window is padded the same way the shop's own booking window is.
  const taken = partyDate
    ? await takenGownIds(
        addDays(partyDate, -(pickupOffset + returnOffset)),
        addDays(partyDate, pickupOffset + returnOffset)
      )
    : new Set<string>();

  const sizes = Array.from(
    new Set(gowns.map((gown) => gown.size).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const filtered = gowns
    .filter((gown) => (size ? gown.size === size : true))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  const thumbnails = await firstPhotoIds(filtered.map((gown) => gown.id));
  const availableCount = filtered.filter((gown) => !taken.has(gown.id)).length;

  // The same gowns the catalogue below lists, in the shape the showroom wants.
  // Built here on the server so the room needs no extra request to open, and
  // deliberately derived from `filtered` — walking the atelier shows exactly
  // what the visitor filtered for, never a different collection.
  const showroomGowns: ShowroomGown[] = filtered.map((gown) => ({
    id: gown.id,
    number: gown.number,
    description: gown.description,
    color: gown.color,
    size: gown.size,
    price: formatMoney(gown.priceCents, settings.currency),
    photoUrl: thumbnails.get(gown.id) ? `/api/public/photos/${thumbnails.get(gown.id)}` : null,
    availability: partyDate ? (taken.has(gown.id) ? "taken" : "free") : "unknown"
  }));

  const dateQuery = params.date ? `?date=${encodeURIComponent(params.date)}` : "";

  return (
    <>
      <JsonLd
        data={[
          collectionSchema(settings, filtered),
          breadcrumbSchema(settings, [
            { name: "Home", path: "/browse" },
            { name: "The Collection", path: "/browse" }
          ])
        ]}
      />

      <section className="hero">
        <div className="hero-inner">
          <span className="hero-eyebrow">{settings.brandName}</span>
          <h1>
            The gown is the easy part.
            <br />
            <em>We handle the rest.</em>
          </h1>
          <p>
            A considered collection, kept immaculately, released one evening at a time. Choose your
            date and see precisely what is free — no guesswork, no holding pattern.
          </p>
          <div className="hero-actions">
            {/* The room first, the list second — but the list is a plain anchor
                to server-rendered markup, so it works with no JavaScript at
                all and the door simply does not appear. */}
            <EnterAtelier gowns={showroomGowns} dateQuery={dateQuery} />
            <a href="#collection" className="btn-lux ghost">
              View the collection
            </a>
            {settings.shopPhone ? (
              <a href={`tel:${settings.shopPhone.replace(/[^\d+]/g, "")}`} className="btn-lux ghost">
                Speak with us
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="shop-section tight" id="collection">
        <div className="section-head">
          <span className="section-eyebrow">The Collection</span>
          <h2>Every gown, and exactly when it&apos;s free.</h2>
        </div>

        <form className="shop-filters" action="/browse" method="get">
          <div className="field">
            <label htmlFor="date">Date of party</label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={params.date ?? ""}
              min={toInputDay(today())}
            />
          </div>
          <div className="field">
            <label htmlFor="size">Size</label>
            <select id="size" name="size" defaultValue={size}>
              <option value="">Any size</option>
              {sizes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-lux gold">
            Show gowns
          </button>
          {params.date || size ? (
            <Link href="/browse" className="btn-lux ghost">
              Reset
            </Link>
          ) : null}
        </form>

        {partyDate ? (
          <p className="shop-result">
            <strong>{availableCount}</strong> of {filtered.length} available for{" "}
            {formatDay(partyDate)}
          </p>
        ) : (
          <p className="shop-result">
            <strong>{filtered.length}</strong> gowns in the collection
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="card empty">
            <strong>Nothing to show yet</strong>
            <span>Please check back shortly, or call us.</span>
          </div>
        ) : (
          <div className="lux-grid">
            {filtered.map((gown) => {
              const isTaken = taken.has(gown.id);
              const requests = pending.get(gown.id) ?? 0;
              const thumbnailId = thumbnails.get(gown.id);
              const href = `/browse/${gown.id}${params.date ? `?date=${params.date}` : ""}`;

              return (
                <Link key={gown.id} href={href} className="lux-card">
                  <div className="lux-shot">
                    {thumbnailId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/public/photos/${thumbnailId}`}
                        alt={`${gown.description}${gown.color ? `, ${gown.color}` : ""}${gown.size ? `, size ${gown.size}` : ""}`}
                        loading="lazy"
                      />
                    ) : (
                      <span className="placeholder">{gown.number}</span>
                    )}
                    {partyDate ? (
                      <span className={isTaken ? "lux-status busy" : "lux-status free"}>
                        {isTaken ? "Taken that weekend" : "Available"}
                      </span>
                    ) : null}
                  </div>
                  <div className="lux-body">
                    <span className="lux-name">{gown.description}</span>
                    <span className="lux-meta">
                      {[gown.size ? `Size ${gown.size}` : null, gown.color]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="lux-price">
                      {formatMoney(gown.priceCents, settings.currency)} <span>· the evening</span>
                    </span>
                    {!isTaken && partyDate && requests > 0 ? (
                      <span className="lux-meta" style={{ color: "var(--primary-ink)" }}>
                        {requests} {requests === 1 ? "enquiry" : "enquiries"} pending
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="band">
        <div className="band-inner">
          <div className="section-head">
            <span className="section-eyebrow">How it works</span>
            <h2>Three steps, and a person at the end of them.</h2>
          </div>
          <div className="steps">
            {STEPS.map((step, index) => (
              <div className="step" key={step.title}>
                <span className="step-num">{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
