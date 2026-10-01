import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // proxy.ts (this Next.js version's middleware) buffers every request
    // body up to this limit before a route handler ever sees it - past it,
    // the body is silently truncated (mid-JSON), req.json() throws, and the
    // request fails with an empty response. The default (10mb) isn't enough
    // for a listing with several photos: up to MAX_LISTING_IMAGES (10)
    // resized JPEGs, each up to ~1MB as a base64 data URL, can add up past
    // it. See node_modules/next/dist/docs/.../proxyClientMaxBodySize.md.
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
