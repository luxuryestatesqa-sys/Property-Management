import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Luxury Estates | Listings",
    short_name: "Luxury Estates",
    description: "Internal property listing management for Luxury Estates agents",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#0f3d3e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
