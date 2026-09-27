import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { searchLocations, describePropertyFinderError } from "@/lib/propertyFinder/client";

// Proxies GET /v1/locations so the API key/secret stay server-side. Property
// Finder recommends the agent pick a location manually from search results
// rather than us auto-matching from area/community text, to avoid
// misassigning the listing to the wrong location.
export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const query = req.nextUrl.searchParams.get("search")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ locations: [] });
  }

  try {
    const locations = await searchLocations(query);
    return NextResponse.json({
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        path: [...l.tree.map((t) => t.name), l.name].join(", "),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: 502 });
  }
}
