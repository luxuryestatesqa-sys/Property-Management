import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";
import { graphVersion, META_CALLBACK_PATH, META_SCOPES, META_WEBHOOK_PATH, missingMetaEnv } from "@/lib/meta/config";

// What the Settings card shows: is Meta set up on the server, the addresses to give Meta, and this
// agency's connected Pages. Tokens never leave the server.
export async function GET(req: NextRequest) {
  const { db, error } = await requireAdmin();
  if (error) return error;

  let base = req.nextUrl.origin;
  let baseNote: string | null = null;
  try {
    base = getAppBaseUrl(req.nextUrl.origin);
  } catch (e) {
    baseNote = e instanceof Error ? e.message : "APP_BASE_URL is not set";
  }
  if (/localhost|127\.0\.0\.1/.test(base)) baseNote = "This is a local address. Meta can only send leads to a public https:// address, so set APP_BASE_URL to your live site (or use a tunnel while testing).";

  const pages = await db!.metaPage.findMany({ orderBy: { name: "asc" }, select: { id: true, pageId: true, name: true, enabled: true, lastLeadAt: true, lastError: true, createdAt: true, businessId: true, businessName: true, disabledForms: true } });
  const missing = missingMetaEnv();
  return NextResponse.json({
    configured: missing.length === 0,
    missing,
    graphVersion: graphVersion(),
    scopes: META_SCOPES,
    webhookUrl: `${base}${META_WEBHOOK_PATH}`,
    callbackUrl: `${base}${META_CALLBACK_PATH}`,
    deauthorizeUrl: `${base}/api/meta/deauthorize`,
    dataDeletionUrl: `${base}/api/meta/data-deletion`,
    baseNote,
    pages,
  });
}
