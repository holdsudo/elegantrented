import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays, formatDay, parseDay, toInputDay, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSettings, settingNumber } from "@/lib/settings";
import { getPublicGown, listGownPhotos, pendingRequestCounts, takenGownIds } from "@/lib/queries";
import { JsonLd, breadcrumbSchema, gownSchema } from "@/lib/schema-org";
import { RequestForm } from "../request-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [gown, settings] = await Promise.all([getPublicGown(id), getSettings()]);
  if (!gown) return { title: "Gown" };

  const details = [gown.color, gown.size ? `size ${gown.size}` : null].filter(Boolean).join(", ");
  const description = `${gown.description}${details ? ` — ${details}` : ""}. Available to rent from ${settings.brandName} at ${formatMoney(gown.priceCents, settings.currency)} for the evening.`;

  const photos = await listGownPhotos(id);
  const image = photos[0] ? `/api/public/photos/${photos[0].id}` : "/og.jpg";

  return {
    title: gown.description,
    description,
    alternates: { canonical: `/browse/${gown.id}` },
    openGraph: {
      title: `${gown.description} · ${settings.brandName}`,
      description,
      url: `/browse/${gown.id}`,
      type: "website",
      images: [{ url: image, alt: gown.description }]
    },
    twitter: { card: "summary_large_image", title: gown.description, description, images: [image] }
  };
}

export default async function GownPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const gown = await getPublicGown(id);
  if (!gown) notFound();

  const settings = await getSettings();
  const pickupOffset = settingNumber(settings, "pickupOffsetDays", 2);
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const partyDate = parseDay(query.date);

  const [photos, pending] = await Promise.all([listGownPhotos(id), pendingRequestCounts()]);

  const taken = partyDate
    ? await takenGownIds(
        addDays(partyDate, -(pickupOffset + returnOffset)),
        addDays(partyDate, pickupOffset + returnOffset)
      )
    : new Set<string>();

  const isTaken = partyDate ? taken.has(gown.id) : false;
  const requests = pending.get(gown.id) ?? 0;

  return (
    <>
      <JsonLd
        data={[
          gownSchema(
            settings,
            gown,
            photos.map((photo) => photo.id),
            !isTaken
          ),
          breadcrumbSchema(settings, [
            { name: "Home", path: "/browse" },
            { name: "The Collection", path: "/browse" },
            { name: gown.description, path: `/browse/${gown.id}` }
          ])
        ]}
      />

      <div className="lux-detail">
        <div className="lux-gallery">
          {photos.length > 0 ? (
            photos.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={`/api/public/photos/${photo.id}`}
                alt={`${gown.description}${gown.color ? `, ${gown.color}` : ""} — view ${index + 1}`}
                loading={index === 0 ? "eager" : "lazy"}
              />
            ))
          ) : (
            <div className="placeholder-shot">{gown.number}</div>
          )}
        </div>

        <div className="lux-detail-body">
          <Link href="/browse" className="lux-back">
            ← The collection
          </Link>

          <h1>{gown.description}</h1>
          <p className="lux-detail-meta">
            {[gown.size ? `Size ${gown.size}` : null, gown.color, `No. ${gown.number}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="lux-detail-price">
            {formatMoney(gown.priceCents, settings.currency)} <span>for the evening</span>
          </p>

          {partyDate ? (
            isTaken ? (
              <div className="lux-note busy">
                <span className="t">Spoken for around {formatDay(partyDate)}</span>
                <p>
                  Plans do change. Send a request anyway and we&apos;ll tell you the moment it
                  frees up.
                </p>
              </div>
            ) : (
              <div className="lux-note free">
                <span className="t">Free on {formatDay(partyDate)}</span>
                <p>
                  {requests > 0
                    ? `${requests} other ${requests === 1 ? "person has" : "people have"} asked about this gown. Nothing is held until we confirm, so it is worth asking.`
                    : "No one has this gown booked around that date."}
                </p>
              </div>
            )
          ) : null}

          <div className="lux-form">
            <h2>Request this gown</h2>
            <RequestForm
              gownId={gown.id}
              defaultDate={query.date ?? ""}
              minDate={toInputDay(today())}
            />
          </div>
        </div>
      </div>
    </>
  );
}
