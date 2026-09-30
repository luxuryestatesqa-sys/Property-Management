import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dataUrlToBuffer } from "@/lib/image";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// Unauthenticated - a portal's servers (Property Finder today, others later)
// fetch listing photos directly from this URL, anonymously, per their image
// requirements. Serves photos for any valid listing image.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params;
  const cleanImageId = imageId.replace(/\.(jpg|jpeg|png|webp)$/i, "");

  const image = await prisma.listingImage.findUnique({
    where: { id: cleanImageId },
    select: {
      url: true,
      listingId: true,
    },
  });

  if (!image || image.listingId !== Number(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  // If the image URL is a remote HTTP/HTTPS URL, redirect to it
  if (image.url.startsWith("http://") || image.url.startsWith("https://")) {
    return NextResponse.redirect(image.url, { status: 302, headers: CORS_HEADERS });
  }

  try {
    const { buffer, contentType } = dataUrlToBuffer(image.url);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("Failed to parse listing image data URL:", err);
    return NextResponse.json({ error: "Invalid image data" }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ id: string; imageId: string }> }) {
  const res = await GET(req, ctx);
  return new NextResponse(null, {
    status: res.status,
    headers: res.headers,
  });
}
