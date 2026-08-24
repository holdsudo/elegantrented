import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings();
  const site = settings.siteUrl.replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/browse"],
        // The back office and its APIs are not for crawlers. They're already
        // behind a login; this just keeps them out of the index.
        disallow: ["/login", "/rentals", "/gowns", "/calendar", "/money", "/settings", "/requests", "/api/"]
      }
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site
  };
}
