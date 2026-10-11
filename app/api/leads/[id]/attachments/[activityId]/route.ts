import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";

// Streams a saved voice note or document. ?download=1 forces a download.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; activityId: string }> }) {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const { id, activityId } = await params;
  const activity = await db!.leadActivity.findFirst({ where: { id: activityId, leadId: id, type: { in: ["VOICE_NOTE", "DOCUMENT"] } }, include: { lead: { select: { assignedToId: true } } } });
  if (!activity || (!isManagerRole(session!.user.role) && activity.lead.assignedToId !== session!.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = activity.data as { name?: string; mime?: string; dataUrl?: string } | null;
  const m = /^data:[^;,]+(?:;[^;,]+)*;base64,(.+)$/.exec(d?.dataUrl ?? "");
  if (!m) return NextResponse.json({ error: "File missing" }, { status: 404 });
  const download = req.nextUrl.searchParams.get("download") === "1";
  const safeName = (d?.name ?? "file").replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(Buffer.from(m[1], "base64"), {
    headers: {
      "Content-Type": d?.mime ?? "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
