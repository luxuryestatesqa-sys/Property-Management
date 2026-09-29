import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dataUrlToBuffer } from "@/lib/image";

// Unauthenticated - a portal's servers (Property Finder today, others later)
// fetch listing photos directly from this URL, anonymously, per their image
// requirements. Only serves a photo once the listing has actually opted into
// at least one portal (an enabled PortalListing row - any portal, not just
// Property Finder) and is ACTIVE - a listing never published anywhere keeps
// its photos reachable only through the authenticated app routes and the
// existing opt-in share link. This check runs on every request (not cached)
// so disabling the toggle takes effect immediately.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params;

  const image = await prisma.listingImage.findUnique({
    where: { id: imageId },
    select: {
      url: true,
      listingId: true,
      listing: {
        select: {
          status: true,
          portalListings: { where: { enabled: true }, select: { id: true }, take: 1 },
        },
      },
    },
  });

  if (
    !image ||
    image.listingId !== Number(id) ||
    image.listing.portalListings.length === 0
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If the image URL is a remote HTTP/HTTPS URL, redirect to it
  if (image.url.startsWith("http://") || image.url.startsWith("https://")) {
    return NextResponse.redirect(image.url, 302);
  }

  try {
    const { buffer, contentType } = dataUrlToBuffer(image.url);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("Failed to parse listing image data URL:", err);
    return NextResponse.json({ error: "Invalid image data" }, { status: 500 });
  }
}
