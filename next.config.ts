import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// The app lives at joe-miz.com/elegantrented, behind a proxy Worker on the zone
// that owns that domain. Everything Next.js generates — routes, /_next assets,
// the server-action endpoints — has to carry the prefix, which is what basePath
// does. Paths we write by hand go through withBase() in src/lib/base-path.ts.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/elegantrented";

const nextConfig: NextConfig = {
  basePath,
  experimental: {
    // Gown photos arrive as multipart form data on a server action.
    serverActions: {
      bodySizeLimit: "12mb",
      // The browser talks to joe-miz.com while the Worker answers as itself, so
      // the Origin header never matches the host Next.js sees. Without these,
      // every server action — login, the booking request, each save in the back
      // office — is rejected as a cross-site POST.
      allowedOrigins: ["joe-miz.com", "rental-ledger.elegentrented.workers.dev", "localhost:3400"]
    }
  }
};

// Gives `next dev` the same D1 binding the deployed Worker gets, backed by local
// emulation — so development exercises the real code paths.
initOpenNextCloudflareForDev();

export default nextConfig;
