import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// The app has its own domain now and is served from the root of it, so there is
// no prefix to carry. The plumbing for sub-path hosting is still in place —
// withBase() is a no-op while this is empty — so setting NEXT_PUBLIC_BASE_PATH
// is all it takes to mount it under a path again.
//
// Imported, never redeclared: a second copy of this default drifted from the
// first once and 404'd every gown photo in production.
import { BASE_PATH as basePath } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  experimental: {
    // Gown photos arrive as multipart form data on a server action.
    serverActions: {
      bodySizeLimit: "12mb",
      // Server actions are rejected as cross-site when the Origin the browser
      // sends doesn't match the host the Worker answers as — which is the case
      // on the workers.dev URL and anywhere the app sits behind a proxy.
      allowedOrigins: [
        "elegantrented.com",
        "www.elegantrented.com",
        "rental-ledger.elegentrented.workers.dev",
        "localhost:3400"
      ]
    }
  }
};

// Gives `next dev` the same D1 binding the deployed Worker gets, backed by local
// emulation — so development exercises the real code paths.
initOpenNextCloudflareForDev();

export default nextConfig;
