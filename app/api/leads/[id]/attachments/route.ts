import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";

// Voice notes and documents are saved on the lead's timeline. The file itself lives in the
// activity's data (as a data URL, like listing photos) and is only served by the file route.
const MAX_BYTES = 3 * 1024 * 1024;
// Only inert file types: no HTML, SVG or scripts, which could run if opened from this site.
const KINDS = {
  VOICE_NOTE: /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)$/,
  DOCUMENT: /^(application\/(pdf|msword|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|zip)|text\/(plain|csv)|image\/(png|jpeg|webp|gif))$/,
} as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ kind?: string; name?: string; text?: string; dataUrl?: string }>(req);
  if (bodyError) return bodyError;

  const kind = body?.kind as keyof typeof KINDS | undefined;
  if (!kind || !(kind in KINDS)) return NextResponse.json({ error: "Unknown attachment type" }, { status: 400 });
  const m = /^data:([\w.+/-]+)(?:;[\w=.+-]+)*;base64,([A-Za-z0-9+/=]+)$/.exec(body?.dataUrl ?? "");
  if (!m) return NextResponse.json({ error: "Couldn't read that file" }, { status: 400 });
  const mime = m[1];
  if (!KINDS[kind].test(mime)) return NextResponse.json({ error: kind === "VOICE_NOTE" ? "That isn't an audio recording" : "That file type isn't supported" }, { status: 400 });
  const size = Math.floor((m[2].length * 3) / 4);
  if (size > MAX_BYTES) return NextResponse.json({ error: "File is too large. The limit is 3 MB." }, { status: 413 });

  const lead = await db!.lead.findFirst({ where: { id }, select: { assignedToId: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!isManagerRole(session!.user.role) && lead.assignedToId !== session!.user.id) return NextResponse.json({ error: "Not your lead" }, { status: 403 });

  const name = (body?.name ?? (kind === "VOICE_NOTE" ? "Voice note" : "Document")).trim().slice(0, 120) || "Attachment";
  const activity = await db!.leadActivity.create({
    data: { organizationId: orgId!, leadId: id, userId: session!.user.id, type: kind, text: body?.text?.trim().slice(0, 500) || null, data: { name, mime, size, dataUrl: body!.dataUrl! } },
    select: { id: true },
  });
  return NextResponse.json({ id: activity.id }, { status: 201 });
}
