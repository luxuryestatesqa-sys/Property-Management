import { NextRequest, NextResponse } from "next/server";
import { requirePermission, parseJsonBody } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { subscribePage, unsubscribePage } from "@/lib/meta/graph";
import { friendlyGraphError } from "@/lib/meta/sync";

// Turn a connected Page on or off. "On" subscribes the Page to Meta's lead webhook, so new leads are
// sent here the moment they are submitted; "off" stops that.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requirePermission("settings.integrations");
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ enabled?: boolean }>(req);
  if (bodyError) return bodyError;
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const page = await db!.metaPage.findFirst({ where: { id } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  try {
    const token = decryptSecret(page.accessToken);
    if (body.enabled) await subscribePage(page.pageId, token);
    else await unsubscribePage(page.pageId, token).catch(() => {}); // the Page may already be gone from Facebook
  } catch (e) {
    const message = friendlyGraphError(e);
    await db!.metaPage.update({ where: { id }, data: { lastError: message.slice(0, 300) } });
    return NextResponse.json({ error: message }, { status: 400 });
  }
  await db!.metaPage.update({ where: { id }, data: { enabled: body.enabled, lastError: null } });
  return NextResponse.json({ ok: true });
}

// Remove a Page: stop the webhook and forget its token.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requirePermission("settings.integrations");
  if (error) return error;
  const { id } = await params;
  const page = await db!.metaPage.findFirst({ where: { id } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  if (page.enabled) {
    try {
      await unsubscribePage(page.pageId, decryptSecret(page.accessToken));
    } catch {
      // best effort: removing it here is what matters
    }
  }
  await db!.metaPage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
