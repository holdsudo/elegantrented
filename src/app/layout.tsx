import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { getSettings, SETTING_DEFAULTS } from "@/lib/settings";

/**
 * Fonts are self-hosted by next/font at build time — no request to Google from
 * the browser, no layout shift, nothing to block first paint.
 */
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap"
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap"
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#14100D" }
  ],
  width: "device-width",
  initialScale: 1,
  colorScheme: "light"
};

export async function generateMetadata(): Promise<Metadata> {
  let settings = { ...SETTING_DEFAULTS } as Record<string, string>;
  try {
    settings = (await getSettings()) as unknown as Record<string, string>;
  } catch {
    // First boot, before the database is reachable — fall back to the defaults.
  }

  const brand = settings.brandName;
  const tagline = settings.brandTagline;
  const site = settings.siteUrl?.replace(/\/+$/, "") || undefined;
  const description = `${brand} — ${tagline} Browse the collection, choose your date, and reserve by request. Every booking confirmed personally.`;

  return {
    ...(site ? { metadataBase: new URL(site) } : {}),
    title: { default: `${brand} — ${tagline}`, template: `%s · ${brand}` },
    description,
    applicationName: brand,
    generator: "Next.js",
    keywords: [
      "dress rental",
      "gown rental",
      "evening gown hire",
      "prom dress rental",
      "wedding guest dress",
      "designer dress rental",
      "formal wear rental",
      brand
    ],
    authors: [{ name: brand }],
    creator: brand,
    publisher: brand,
    category: "shopping",
    referrer: "origin-when-cross-origin",
    alternates: { canonical: "/" },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "any" }
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }]
    },
    openGraph: {
      type: "website",
      siteName: brand,
      title: `${brand} — ${tagline}`,
      description,
      locale: "en_US",
      ...(site ? { url: site } : {}),
      images: [
        {
          url: "/og.jpg",
          width: 1200,
          height: 630,
          alt: `${brand} — ${tagline}`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: `${brand} — ${tagline}`,
      description,
      images: ["/og.jpg"]
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1
      }
    }
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
