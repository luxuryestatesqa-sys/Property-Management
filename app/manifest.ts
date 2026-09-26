import type { MetadataRoute } from "next";

// Vercel's edge cache holds these plain public/ static files more stubbornly
// than Next's own metadata-file routes (icon.png, apple-icon.png), which get
// a fresh cache key automatically - a deploy alone doesn't reliably bust an
// already-cached /icons/icon-*.png at the edge. Bump this whenever the icon
// files change so the manifest points at a URL the CDN has never cached.
const ICON_VERSION = "2";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Luxury Estates | Listings",
    short_name: "Luxury Estates",
    description: "Internal property listing management for Luxury Estates agents",
    start_url: "/",
    display: "standalone",
    // Matches #app-splash's background (globals.css) so the OS's own
    // app-launch splash (icon + this color) hands off to our splash with no
    // visible color jump - only the foreground (icon -> real logo) changes.
    background_color: "#0f3d3e",
    theme_color: "#0f3d3e",
    icons: [
      { src: `/icons/icon-192.png?v=${ICON_VERSION}`, sizes: "192x192", type: "image/png" },
      { src: `/icons/icon-512.png?v=${ICON_VERSION}`, sizes: "512x512", type: "image/png" },
    ],
  };
}
