import { NextResponse, type NextRequest } from "next/server";

/**
 * Splits the two halves of the app across two hostnames.
 *
 *   elegantrented.com      the storefront. "/" is the collection.
 *   crm.elegantrented.com  the back office and its login.
 *
 * It is one Next.js app either way — the same build, the same D1 — so this is
 * presentation, not a security boundary. Every back-office route still calls
 * requireUser(); reaching one by another hostname gets you the login page, not
 * the data. Nothing here is load-bearing for access control.
 */

const CRM_HOST = "crm.elegantrented.com";

/** The hostnames the public site answers on. */
const PUBLIC_HOSTS = new Set(["elegantrented.com", "www.elegantrented.com"]);

/** Everything that belongs to the back office. */
const CRM_PREFIXES = [
  "/login",
  "/gowns",
  "/rentals",
  "/customers",
  "/calendar",
  "/money",
  "/reports",
  "/requests",
  "/settings"
];

function isCrmPath(pathname: string) {
  return CRM_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const { pathname, search } = request.nextUrl;

  // The back office should never be indexed, whichever path reaches it.
  if (host === CRM_HOST) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // localhost and the workers.dev fallback keep the whole app on one hostname.
  // There is no crm.localhost to redirect to, and sending a developer off to
  // production mid-session would be worse than the split being imperfect there.
  if (!PUBLIC_HOSTS.has(host)) return NextResponse.next();

  // On the public site the collection is the front page.
  if (pathname === "/") {
    return NextResponse.rewrite(new URL(`/browse${search}`, request.url));
  }

  // The back office lives on its own hostname.
  if (isCrmPath(pathname)) {
    return NextResponse.redirect(`https://${CRM_HOST}${pathname}${search}`, 308);
  }

  return NextResponse.next();
}

export const config = {
  // Static assets and the API are served identically on both hostnames.
  matcher: ["/((?!_next/|api/).*)"]
};
