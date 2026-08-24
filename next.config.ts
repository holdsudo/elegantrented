import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  experimental: {
    // Gown photos arrive as multipart form data on a server action.
    serverActions: { bodySizeLimit: "12mb" }
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Keep three.js out of the Worker.
      //
      // The showroom and the turntable are `next/dynamic(..., { ssr: false })`,
      // so they never render on the server — but `ssr: false` only suppresses
      // rendering, it does not stop Next compiling the module into the server
      // graph. That dragged 507 KB of WebGL (118 KiB gzipped, ~11% of the
      // Worker) into a runtime that has no canvas and can never execute a line
      // of it.
      //
      // Resolving it to an empty module on the server build only is safe
      // precisely because nothing server-side touches it: every server file
      // that mentions three does so as `import type`, which is erased, and the
      // two runtime `await import("three")` calls live inside effects that only
      // ever run in a browser. The client build is untouched and still gets the
      // real library as its own lazy chunk.
      config.resolve.alias = { ...config.resolve.alias, three: false };
    }
    return config;
  }
};

// Gives `next dev` the same D1 binding the deployed Worker gets, backed by local
// emulation — so development exercises the real code paths.
initOpenNextCloudflareForDev();

export default nextConfig;
