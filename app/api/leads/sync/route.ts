import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-helpers";
import { syncPropertyFinderLeads, LeadsScopeError } from "@/lib/leads/sync";
import { describePropertyFinderError, PropertyFinderApiError } from "@/lib/propertyFinder/client";
import { PropertyFinderNotConfiguredError } from "@/lib/propertyFinder/auth";

// Admin-only "Sync now": pulls the last ~3 months of Property Finder leads for
// this agency. Webhooks keep things current in real time; this backfills history
// and catches anything a webhook missed.
export async function POST() {
  const { orgId, error } = await requirePermission("settings.integrations");
  if (error) return error;
  try {
    const result = await syncPropertyFinderLeads(orgId!);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LeadsScopeError || err instanceof PropertyFinderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: err instanceof PropertyFinderApiError ? 502 : 500 });
  }
}
