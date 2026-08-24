import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Request received",
    // A confirmation page has no business in search results.
    robots: { index: false, follow: false }
  };
}

export default async function SentPage() {
  const settings = await getSettings();

  return (
    <div className="shop-sent">
      <h1>Thank you — we have it.</h1>
      <p>
        We&apos;ll be in touch to confirm, usually the same day.
        {settings.shopPhone ? (
          <>
            {" "}
            If it&apos;s urgent, call{" "}
            <a href={`tel:${settings.shopPhone.replace(/[^\d+]/g, "")}`}>{settings.shopPhone}</a>.
          </>
        ) : null}
      </p>

      <div className="lux-note" style={{ textAlign: "left", maxWidth: 440 }}>
        <span className="t">Your date isn&apos;t held yet</span>
        <p>
          A request tells us what you would like. The gown becomes yours the moment we confirm it
          with you — never before.
        </p>
      </div>

      <div className="hero-actions">
        <Link href="/browse" className="btn-lux">
          Back to the collection
        </Link>
      </div>
    </div>
  );
}
