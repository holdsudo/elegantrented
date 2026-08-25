import type { Settings } from "@/lib/settings";
import { siteBase } from "@/lib/settings";
import type { Gown } from "@/lib/queries";

/**
 * JSON-LD builders.
 *
 * Only fields that are actually filled in get emitted — an address or an opening
 * hour that nobody entered is not invented here. Structured data that lies is
 * worse than none, both for the reader and for Google.
 */

function site(settings: Settings) {
  return siteBase(settings);
}

function prune<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string") return value.trim() !== "";
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  ) as T;
}

export function organizationSchema(settings: Settings) {
  const base = site(settings);
  const hasAddress = Boolean(settings.shopCity || settings.shopStreet);

  return prune({
    "@context": "https://schema.org",
    "@type": hasAddress ? "ClothingStore" : "Organization",
    "@id": `${base}/#organization`,
    name: settings.brandName,
    description: settings.brandTagline,
    url: base,
    logo: `${base}/icon.svg`,
    image: `${base}/og.jpg`,
    telephone: settings.shopPhone || undefined,
    email: settings.shopEmail || undefined,
    priceRange: "$$–$$$",
    sameAs: [settings.instagramUrl].filter(Boolean),
    address: hasAddress
      ? prune({
          "@type": "PostalAddress",
          streetAddress: settings.shopStreet || undefined,
          addressLocality: settings.shopCity || undefined,
          addressRegion: settings.shopRegion || undefined,
          postalCode: settings.shopPostal || undefined,
          addressCountry: "US"
        })
      : undefined
  });
}

export function websiteSchema(settings: Settings) {
  const base = site(settings);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: settings.brandName,
    url: base,
    publisher: { "@id": `${base}/#organization` },
    inLanguage: "en-US"
  };
}

/** One gown, as a rentable product with an offer. */
export function gownSchema(
  settings: Settings,
  gown: Gown,
  photoIds: string[],
  available: boolean
) {
  const base = site(settings);
  return prune({
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${base}/browse/${gown.id}#product`,
    name: gown.description,
    sku: gown.number,
    description: [
      gown.description,
      gown.color ? `Colour: ${gown.color}.` : "",
      gown.size ? `Size ${gown.size}.` : "",
      `Available to rent from ${settings.brandName}.`
    ]
      .filter(Boolean)
      .join(" "),
    color: gown.color || undefined,
    size: gown.size || undefined,
    category: "Dress rental",
    image: photoIds.map((id) => `${base}/api/public/photos/${id}`),
    brand: { "@type": "Brand", name: settings.brandName },
    offers: prune({
      "@type": "Offer",
      "@id": `${base}/browse/${gown.id}#offer`,
      url: `${base}/browse/${gown.id}`,
      priceCurrency: settings.currency,
      price: (gown.priceCents / 100).toFixed(2),
      // A rental, not a sale — the price buys the hire period.
      availability: available
        ? "https://schema.org/InStock"
        : "https://schema.org/PreOrder",
      businessFunction: "https://schema.org/LeaseOut",
      seller: { "@id": `${base}/#organization` }
    })
  });
}

export function breadcrumbSchema(settings: Settings, trail: Array<{ name: string; path: string }>) {
  const base = site(settings);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: `${base}${step.path}`
    }))
  };
}

export function collectionSchema(settings: Settings, gowns: Gown[]) {
  const base = site(settings);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${base}/browse#collection`,
    name: `The collection · ${settings.brandName}`,
    description: `Gowns available to rent from ${settings.brandName}.`,
    isPartOf: { "@id": `${base}/#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: gowns.length,
      itemListElement: gowns.slice(0, 60).map((gown, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: gown.description,
        url: `${base}/browse/${gown.id}`
      }))
    }
  };
}

/** Renders one or more JSON-LD blocks. */
export function JsonLd({ data }: { data: unknown[] }) {
  return (
    <>
      {data.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          // Content is built from our own settings and rows, never raw user HTML.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry).replace(/</g, "\\u003c") }}
        />
      ))}
    </>
  );
}
