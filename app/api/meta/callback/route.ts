import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { encryptSecret, verifyValue } from "@/lib/crypto";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";
import { META_CALLBACK_PATH } from "@/lib/meta/config";
import { exchangeCode, getMe, listBusinessesWithPages, listManagedPages, longLivedUserToken } from "@/lib/meta/graph";

const back = (req: NextRequest, meta: string, extra = "") => NextResponse.redirect(new URL(`/profile?tab=lead-sources&meta=${meta}${extra}`, req.nextUrl.origin));

// Where Facebook sends the admin back to. We trade the code for a long-lived token, list the Pages
// they manage and save each one (switched off) with its own Page token, encrypted. The admin then
// turns on the Pages they want in Settings.
export async function GET(req: NextRequest) {
  const { session, orgId, error } = await requireAdmin();
  if (error) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  const sp = req.nextUrl.searchParams;

  if (sp.get("error")) return back(req, "denied");
  const state = verifyValue<{ org?: string; user?: string }>(sp.get("state"));
  if (!state || state.org !== orgId || state.user !== session!.user.id) return back(req, "bad_state");
  const code = sp.get("code");
  if (!code) return back(req, "denied");

  let base = req.nextUrl.origin;
  try {
    base = getAppBaseUrl(req.nextUrl.origin);
  } catch {
    // keep the request's own address
  }

  try {
    const userToken = await longLivedUserToken(await exchangeCode(code, `${base}${META_CALLBACK_PATH}`));
    const [me, pages, businesses] = await Promise.all([getMe(userToken), listManagedPages(userToken), listBusinessesWithPages(userToken)]);
    const businessOf = new Map<string, { id: string; name: string }>();
    for (const b of businesses) for (const id of b.pageIds) if (!businessOf.has(id)) businessOf.set(id, { id: b.id, name: b.name });

    let saved = 0;
    let taken = 0;
    for (const p of pages) {
      // Only people who can run ads on a Page can read its leads.
      const canAdvertise = !p.tasks || p.tasks.includes("ADVERTISE") || p.tasks.includes("MANAGE");
      // A Page belongs to one agency at a time: the webhook finds the agency from the Page id.
      const existing = await prisma.metaPage.findUnique({ where: { pageId: p.id }, select: { organizationId: true } });
      if (existing && existing.organizationId !== orgId) {
        taken++;
        continue;
      }
      const biz = businessOf.get(p.id);
      // Only touch the grouping when Facebook let us read businesses; without that permission keep what we had.
      const grouping = businesses.length ? { businessId: biz?.id ?? null, businessName: biz?.name ?? null } : {};
      const data = { name: p.name, accessToken: encryptSecret(p.access_token), fbUserId: me.id, connectedById: session!.user.id, ...grouping, lastError: canAdvertise ? null : "Your Facebook account can't run ads on this page, so its leads can't be read. Ask a page admin to give you the Ads permission." };
      await prisma.metaPage.upsert({ where: { pageId: p.id }, create: { organizationId: orgId!, pageId: p.id, enabled: false, ...data }, update: data });
      saved++;
    }
    return back(req, "connected", `&pages=${saved}${taken ? `&taken=${taken}` : ""}`);
  } catch (e) {
    return back(req, "failed", `&reason=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 120) : "unknown")}`);
  }
}
