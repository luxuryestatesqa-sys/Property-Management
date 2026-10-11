import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { friendlyGraphError, recordPageError, syncPage } from "@/lib/meta/sync";

// "Fetch leads now": pulls the leads Meta still holds for this Page (up to 90 days) and saves any we
// don't have yet. Useful right after connecting, and to catch anything a webhook missed.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const page = await db!.metaPage.findFirst({ where: { id } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  try {
    return NextResponse.json(await syncPage(page));
  } catch (e) {
    const message = friendlyGraphError(e);
    await recordPageError(page.id, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
