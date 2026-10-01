import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { getCreditBalance, describePropertyFinderError } from "@/lib/propertyFinder/client";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";

export interface ImageReachabilityResult {
  ok: boolean;
  baseUrl: string;
  detail: string;
}

// Property Finder fetches listing photos from APP_BASE_URL itself, as a
// server, completely separately from the credentials check above - a
// correctly-configured API key says nothing about whether that URL is
// actually reachable from the outside. The most common way this silently
// breaks: APP_BASE_URL is unset (or wrong) and falls back to Vercel's
// per-deployment VERCEL_URL, which Vercel's own "Deployment Protection"
// gates behind an SSO redirect for every external caller, Property Finder
// included - photos then fail to fetch on their side (shown there as
// missing/placeholder images) and a listing with enough failed photos can
// end up excluded from Property Finder's own public search, which is also
// what a dead-looking public listing URL on their site usually means.
//
// This probes the exact same URL shape used for real listing photos
// (lib/propertyFinder/sync.ts's buildListingPayload) - not a real image id,
// since none is needed: a plain 404 JSON response proves the route executed
// normally, while a redirect (an SSO login page), a timeout, or anything
// else proves the opposite, without this app ever needing to see what
// APP_BASE_URL is actually set to.
async function checkImageReachability(): Promise<ImageReachabilityResult> {
  let baseUrl: string;
  try {
    baseUrl = getAppBaseUrl();
  } catch (err) {
    return { ok: false, baseUrl: "(unset)", detail: err instanceof Error ? err.message : "APP_BASE_URL is not set" };
  }

  const probeUrl = `${baseUrl}/api/listings/0/images/connectivity-probe.jpg`;
  try {
    const res = await fetch(probeUrl, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) {
      return { ok: true, baseUrl, detail: "Reachable - Property Finder should be able to fetch photos from this URL." };
    }
    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        baseUrl,
        detail: `Got redirected (HTTP ${res.status}) instead of reaching the app - this usually means Vercel's Deployment Protection is blocking external requests to this URL. Check APP_BASE_URL points at your public production domain, and that Deployment Protection is off (or bypassed) for it.`,
      };
    }
    return { ok: false, baseUrl, detail: `Got an unexpected response (HTTP ${res.status}) instead of the expected 404.` };
  } catch (err) {
    return { ok: false, baseUrl, detail: `Could not reach ${baseUrl} at all: ${err instanceof Error ? err.message : "network error"}.` };
  }
}

// Confirms the stored credentials actually work by making one real, cheap
// call - not just checking that the fields are non-empty - and separately
// confirms this app's own listing-photo URLs are publicly reachable, since
// Property Finder needs both to actually show a listing with working photos.
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  const imageReachability = await checkImageReachability();

  try {
    const balance = await getCreditBalance();
    return NextResponse.json({ ok: true, balance, imageReachability });
  } catch (err) {
    return NextResponse.json({ ok: false, error: describePropertyFinderError(err), imageReachability }, { status: 502 });
  }
}
