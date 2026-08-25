/**
 * joe-miz.com/elegantrented -> elegantrented.com
 *
 * This Worker used to proxy the app, which lived on a sub-path of joe-miz.com
 * because it had no domain of its own. It has one now, on the same Cloudflare
 * account as the Worker that runs it, so the proxy is retired.
 *
 * What is left is a redirect, so that links already shared under the old path
 * still land somewhere. The old path carried a /elegantrented prefix that the
 * app no longer serves, so it is stripped before forwarding.
 */

const DESTINATION = "https://elegantrented.com";
const OLD_PREFIX = "/elegantrented";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.startsWith(OLD_PREFIX)
      ? url.pathname.slice(OLD_PREFIX.length)
      : url.pathname;

    return Response.redirect(`${DESTINATION}${path || "/"}${url.search}`, 301);
  }
};
