import type { MetadataRoute } from "next";
import { getSettings, siteBase } from "@/lib/settings";
import { withBase } from "@/lib/base-path";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings();
  const site = siteBase(settings);

  return {
    rules: [
      {
        userAgent: "*",
        allow: [withBase("/"), withBase("/browse")],
        // The back office and its APIs are not for crawlers. They're already
        // behind a login; this just keeps them out of the index.
        disallow: [
          "/login", "/rentals", "/gowns", "/calendar", "/money", "/settings", "/requests", "/api/"
        ].map(withBase)
      }
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site
  };
}
