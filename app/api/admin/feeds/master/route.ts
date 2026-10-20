import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-helpers";
import { getMasterFeedReport } from "@/lib/feeds/masterReport";

// Admin-only readout for the master feed card: how many listings are in
// /feeds/all.xml and why any switched-on listing was left out.
export async function GET() {
  const { orgId, error } = await requirePermission("settings.integrations");
  if (error) return error;
  return NextResponse.json(await getMasterFeedReport(orgId!));
}
