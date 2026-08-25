/**
 * The sub-path the app is mounted at. Empty when it is served from the root of
 * its own domain, which is the case today.
 *
 * Next.js prefixes `<Link href>`, `redirect()` and everything under `/_next`
 * with `basePath` on its own, but it cannot rewrite strings we hand straight to
 * the browser — a raw `<form action>`, an `<img src>` pointing at an API route,
 * a manifest entry. Those go through withBase().
 *
 * next.config.ts imports this value rather than repeating it. It used to declare
 * its own copy, and the two drifted: links lost the prefix while withBase() kept
 * adding it, which 404'd every gown photo on the live site.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes an app-absolute path with the base path. Leaves other URLs alone. */
export function withBase(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith("/")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
