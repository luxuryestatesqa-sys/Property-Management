import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { getMasterFeedReport } from "@/lib/feeds/masterReport";

// Admin-only readout for the master feed card: how many listings are in
// /feeds/all.xml and why any switched-on listing was left out.
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json(await getMasterFeedReport());
}
