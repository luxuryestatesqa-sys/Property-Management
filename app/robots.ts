import type { MetadataRoute } from "next";

// This is a private working tool, not a public site: keep it out of search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
