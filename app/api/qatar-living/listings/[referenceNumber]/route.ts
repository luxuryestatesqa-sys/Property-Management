import { NextRequest, NextResponse } from "next/server";
import { requireQatarLivingAuth } from "@/lib/qatarLiving/auth";
import { getQatarLivingListingByReference } from "@/lib/qatarLiving/query";

// Optional single-listing lookup (QL spec §4.2) alongside the paginated
// list endpoint (../route.ts) - same auth, same eligibility rules.
export async function GET(req: NextRequest, { params }: { params: Promise<{ referenceNumber: string }> }) {
  const authResult = await requireQatarLivingAuth(req);
  if (!("orgId" in authResult)) return authResult;

  const { referenceNumber } = await params;
  const listing = await getQatarLivingListingByReference(authResult.orgId, referenceNumber);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(listing);
}
