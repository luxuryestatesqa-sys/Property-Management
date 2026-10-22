import type { NextConfig } from "next";
import path from "path";

// Browser protections sent with every page and API answer: the app cannot be shown inside another site's frame
// (clickjacking), browsers must not guess file types, the full address is not leaked to other sites, and the
// connection must stay on HTTPS. The microphone is for voice notes on a lead; camera and location are never used.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
