import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    // Listing photos are served by our own image route; the optimizer resizes them (and caches the result)
    // so a card downloads a thumbnail, not the full photo.
    localPatterns: [{ pathname: "/api/listings/**" }],
    formats: ["image/webp"],
    minimumCacheTTL: 31536000,
  },
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    // Settings used to live at /profile; old bookmarks keep working.
    return [{ source: "/profile", destination: "/settings", permanent: true }];
  },
  experimental: {
    // proxy.ts (this Next.js version's middleware) buffers every request
    // body up to this limit before a route handler ever sees it - past it,
    // the body is silently truncated (mid-JSON), req.json() throws, and the
    // request fails with an empty response. The default (10mb) isn't enough
    // for a listing with several photos: up to MAX_LISTING_IMAGES (25)
    // resized JPEGs, each up to ~1MB as a base64 data URL, can add up past
    // it (photos are also sent in batches, see lib/photoBatches.ts). See node_modules/next/dist/docs/.../proxyClientMaxBodySize.md.
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
