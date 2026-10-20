import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-helpers";
import { signValue } from "@/lib/crypto";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";
import { META_CALLBACK_PATH, missingMetaEnv } from "@/lib/meta/config";
import { loginUrl } from "@/lib/meta/graph";

const back = (req: NextRequest, meta: string) => NextResponse.redirect(new URL(`/profile?tab=lead-sources&meta=${meta}`, req.nextUrl.origin));

// Starts "Connect Facebook": sends the admin to Facebook to choose which Pages to share. The signed
// `state` ties the way back to this agency and this person.
export async function GET(req: NextRequest) {
  const { session, orgId, error } = await requirePermission("settings.integrations");
  if (error) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (missingMetaEnv().length) return back(req, "not_configured");

  let base = req.nextUrl.origin;
  try {
    base = getAppBaseUrl(req.nextUrl.origin);
  } catch {
    // fall back to the address this request came in on
  }
  const state = signValue({ org: orgId, user: session!.user.id }, 600);
  return NextResponse.redirect(loginUrl(`${base}${META_CALLBACK_PATH}`, state));
}
