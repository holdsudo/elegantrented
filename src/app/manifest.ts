import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";
import { withBase } from "@/lib/base-path";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettings();

  return {
    name: `${settings.brandName} — ${settings.brandTagline}`,
    short_name: settings.brandName,
    description: settings.brandTagline,
    start_url: withBase("/browse"),
    scope: withBase("/"),
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#14100D",
    orientation: "portrait",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: withBase("/icon.svg"), sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: withBase("/apple-touch-icon.png"), sizes: "180x180", type: "image/png" },
      { src: withBase("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
