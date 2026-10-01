import { NextRequest, NextResponse } from "next/server";
import { requireQatarLivingAuth } from "@/lib/qatarLiving/auth";
import { getQatarLivingPage } from "@/lib/qatarLiving/query";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Qatar Living's own listings feed API (their spec v1.0, §4.1) - a paginated
// REST/JSON endpoint QL polls on a schedule, not one of the generic
// pull-feed files under app/feeds/[portal] (those are XML/JSON placeholders
// for portals with no confirmed spec yet; this one replaces the old
// qatarliving.xml placeholder now that QL's real spec is known). Exempted
// from the session-auth middleware in proxy.ts since QL's crawler has no
// CRM session - authenticated instead by the X-API-Key header.
export async function GET(req: NextRequest) {
  const authError = await requireQatarLivingAuth(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;

  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSizeParam = parseInt(params.get("page_size") ?? "", 10);
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? Math.min(pageSizeParam, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  const updatedSinceParam = params.get("updated_since");
  let updatedSince: Date | null = null;
  if (updatedSinceParam) {
    const parsed = new Date(updatedSinceParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "updated_since must be a valid ISO-8601 timestamp" }, { status: 400 });
    }
    updatedSince = parsed;
  }

  const { listings, total } = await getQatarLivingPage(page, pageSize, updatedSince);

  return NextResponse.json({
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    listings,
  });
}
