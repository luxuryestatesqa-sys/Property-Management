import { NextRequest, NextResponse } from "next/server";
import { requirePermission, parseJsonBody } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { listFormsDetailed } from "@/lib/meta/graph";
import { friendlyGraphError, recordPageError } from "@/lib/meta/sync";

// The lead forms on a connected Page, read live from Facebook, with whether this agency imports each one.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requirePermission("settings.integrations");
  if (error) return error;
  const { id } = await params;
  const page = await db!.metaPage.findFirst({ where: { id } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  try {
    const forms = await listFormsDetailed(page.pageId, decryptSecret(page.accessToken));
    return NextResponse.json({
      forms: forms
        .filter((f) => f.status !== "DELETED")
        .map((f) => ({ id: f.id, name: f.name, status: f.status ?? null, leads: f.leads_count ?? null, createdAt: f.created_time ?? null, enabled: !page.disabledForms.includes(f.id) })),
    });
  } catch (e) {
    const message = friendlyGraphError(e);
    await recordPageError(page.id, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// { formId, enabled } or { formIds: [...], enabled } - choose which forms' leads come in. A form is on
// until you switch it off, so a new form someone creates later is picked up automatically.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requirePermission("settings.integrations");
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ formId?: string; formIds?: string[]; enabled?: boolean }>(req);
  if (bodyError) return bodyError;
  const ids = Array.isArray(body?.formIds) ? body!.formIds.filter((x) => typeof x === "string" && x) : typeof body?.formId === "string" && body.formId ? [body.formId] : [];
  if (ids.length === 0 || ids.length > 500 || typeof body?.enabled !== "boolean") return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const page = await db!.metaPage.findFirst({ where: { id } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  const off = new Set(page.disabledForms);
  for (const formId of ids) {
    if (body.enabled) off.delete(formId);
    else off.add(formId);
  }
  await db!.metaPage.update({ where: { id }, data: { disabledForms: [...off].slice(0, 500) } });
  return NextResponse.json({ ok: true });
}
