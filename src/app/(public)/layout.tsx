import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { primaryTheme } from "@/lib/color";
import { JsonLd, organizationSchema, websiteSchema } from "@/lib/schema-org";

/**
 * The storefront shell.
 *
 * Deliberately outside the (app) route group, which calls requireUser() — these
 * pages must render for someone who has never signed in. Nothing here reads a
 * session, and nothing here can write a Rental.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const theme =
    settings.brandPrimary && settings.brandPrimary !== "#B08D57"
      ? primaryTheme(settings.brandPrimary)
      : null;

  const year = new Date().getFullYear();

  return (
    <div className="shop">
      {theme ? (
        <style>{`:root{--primary:${theme.primary};--primary-ink:${theme.primaryInk};--primary-soft:${theme.primarySoft};--on-primary:${theme.onPrimary};}`}</style>
      ) : null}

      <JsonLd data={[organizationSchema(settings), websiteSchema(settings)]} />

      <header className="shop-head">
        <Link href="/browse" className="shop-brand" aria-label={`${settings.brandName} — home`}>
          <span className="wordmark">{settings.brandName}</span>
          <span className="rule" aria-hidden="true" />
          <span className="sub">Atelier</span>
        </Link>
        <nav className="shop-contact">
          <Link href="/browse">The collection</Link>
          {settings.shopPhone ? (
            <a href={`tel:${settings.shopPhone.replace(/[^\d+]/g, "")}`}>{settings.shopPhone}</a>
          ) : null}
          {settings.shopEmail ? <a href={`mailto:${settings.shopEmail}`}>{settings.shopEmail}</a> : null}
        </nav>
      </header>

      <main className="shop-main">{children}</main>

      <footer className="shop-foot">
        <div className="foot-inner">
          <div className="foot-brand">
            <div className="wordmark">{settings.brandName}</div>
            <p>{settings.brandTagline}</p>
          </div>

          <div className="foot-col">
            <h4>Browse</h4>
            <Link href="/browse">The collection</Link>
            <Link href="/browse?size=">By size</Link>
          </div>

          <div className="foot-col">
            <h4>Visit</h4>
            {settings.shopAddress ? <span>{settings.shopAddress}</span> : null}
            {settings.shopCity ? (
              <span>
                {settings.shopCity}
                {settings.shopRegion ? `, ${settings.shopRegion}` : ""} {settings.shopPostal}
              </span>
            ) : null}
            {!settings.shopAddress && !settings.shopCity ? <span>By appointment</span> : null}
          </div>

          <div className="foot-col">
            <h4>Contact</h4>
            {settings.shopPhone ? (
              <a href={`tel:${settings.shopPhone.replace(/[^\d+]/g, "")}`}>{settings.shopPhone}</a>
            ) : null}
            {settings.shopEmail ? <a href={`mailto:${settings.shopEmail}`}>{settings.shopEmail}</a> : null}
            {settings.instagramUrl ? (
              <a href={settings.instagramUrl} rel="noreferrer noopener" target="_blank">
                Instagram
              </a>
            ) : null}
          </div>
        </div>

        <div className="foot-rule">
          <span>
            © {year} {settings.brandName}
          </span>
          <span>A request does not reserve a gown. Every booking is confirmed personally.</span>
        </div>
      </footer>
    </div>
  );
}
