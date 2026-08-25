/**
 * The app is served from a sub-path of joe-miz.com (`/elegantrented`), not from
 * the root of its own domain. Next.js prefixes `<Link href>`, `redirect()` and
 * everything under `/_next` with `basePath` on its own, but it cannot rewrite
 * strings we hand straight to the browser — a raw `<form action>`, an `<img
 * src>` pointing at an API route, a manifest entry. Those go through withBase().
 *
 * Keep this in step with `basePath` in next.config.ts; both read the same env
 * var so a single override moves the whole app.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/elegantrented";

/** Prefixes an app-absolute path with the base path. Leaves other URLs alone. */
export function withBase(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith("/")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
