import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  experimental: {
    // Gown photos arrive as multipart form data on a server action.
    serverActions: { bodySizeLimit: "12mb" }
  }
};

// Gives `next dev` the same D1 binding the deployed Worker gets, backed by local
// emulation — so development exercises the real code paths.
initOpenNextCloudflareForDev();

export default nextConfig;
