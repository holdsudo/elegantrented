import type { MetadataRoute } from "next";
import { getSettings, siteBase } from "@/lib/settings";
import { listPublicGowns } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Every public page, plus one entry per listed gown. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSettings();
  const site = siteBase(settings);

  let gowns: Awaited<ReturnType<typeof listPublicGowns>> = [];
  try {
    gowns = await listPublicGowns();
  } catch {
    // A sitemap that lists the front page beats a 500.
  }

  return [
    {
      url: `${site}/browse`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1
    },
    ...gowns.map((gown) => ({
      url: `${site}/browse/${gown.id}`,
      lastModified: gown.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    }))
  ];
}
