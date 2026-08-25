/**
 * joe-miz.com/elegantrented -> the rental-ledger Worker.
 *
 * The app, its D1 database and the gown photos all live in a different
 * Cloudflare account. A Worker route can only bind to a zone in its own
 * account, so this Worker sits on the zone that owns joe-miz.com and forwards
 * whatever arrives under /elegantrented to the account that has the app.
 *
 * The path is passed through untouched: the app is built with a matching
 * basePath, so it already expects the prefix and generates its own links with
 * it. Nothing here rewrites HTML.
 */

const ORIGIN = "https://rental-ledger.elegentrented.workers.dev";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, ORIGIN);

    // Duplex is required for streamed request bodies (photo uploads).
    const upstream = new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      ...(request.body ? { duplex: "half" } : {})
    });

    // The app checks this against its allowed origins before accepting a server
    // action, and uses it to know which host the visitor actually typed.
    upstream.headers.set("X-Forwarded-Host", url.host);
    upstream.headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

    const response = await fetch(upstream);

    // A redirect that names the origin Worker would walk the visitor off the
    // domain. Point any such Location back at joe-miz.com.
    const location = response.headers.get("Location");
    if (location && location.startsWith(ORIGIN)) {
      const rewritten = new Headers(response.headers);
      rewritten.set("Location", location.slice(ORIGIN.length) || "/");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: rewritten
      });
    }

    return response;
  }
};
