import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { dataUrlToBuffer } from "@/lib/image";

// A teammate's profile photo as a real, cacheable image (people in the same agency only).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const user = await db!.user.findFirst({ where: { id }, select: { avatarUrl: true } });
  if (!user?.avatarUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { buffer, contentType } = dataUrlToBuffer(user.avatarUrl);
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": contentType, "Content-Length": String(buffer.length), "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
