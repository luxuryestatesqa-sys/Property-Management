import { getAccessToken, PF_BASE_URL, PropertyFinderNotConfiguredError } from "./auth";

// Structured (RFC-9457-ish) error shape returned when we send
// X-PF-Error-Format: problem-json-v2 - see the Enterprise API's "Error
// Responses" docs. The legacy shape is deprecated, so every request here
// opts into this one.
export interface PFFieldError {
  type?: string;
  detail?: string;
  pointer?: string; // JSON Pointer to the offending field, e.g. "/bathrooms"
}

export class PropertyFinderApiError extends Error {
  status: number;
  code?: string;
  fieldErrors: PFFieldError[];

  constructor(status: number, message: string, code?: string, fieldErrors: PFFieldError[] = []) {
    super(message);
    this.name = "PropertyFinderApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// Shared by every route that proxies a Property Finder call, so "not
// configured yet" and real API errors both surface a useful message instead
// of a generic 502.
export function describePropertyFinderError(err: unknown): string {
  if (err instanceof PropertyFinderNotConfiguredError) return err.message;
  if (err instanceof PropertyFinderApiError) return err.message;
  // Anything else (a thrown config error like a missing APP_BASE_URL, a raw
  // network failure, ...) still gets its real message surfaced - masking it
  // behind a generic "couldn't reach Property Finder" previously hid genuine
  // local/deploy misconfiguration from the admin trying to diagnose it.
  if (err instanceof Error) return err.message;
  return "Failed to reach Property Finder";
}

async function pfFetch<T>(path: string, init: RequestInit = {}, retryOn401 = true): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${PF_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-PF-Error-Format": "problem-json-v2",
      // Undocumented but confirmed in practice: /v1/locations returns a bare
      // "404 page not found" (not even their structured error shape) when
      // this header is missing, despite the docs listing it as optional with
      // an "en" default. Sending it explicitly on every request sidesteps
      // whatever routing quirk causes that.
      "Accept-Language": "en",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && retryOn401) {
    const { clearCachedToken } = await import("./auth");
    clearCachedToken();
    return pfFetch<T>(path, init, false);
  }

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    let body: { detail?: string; title?: string; code?: string; errors?: PFFieldError[] } | null = null;
    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch {
      body = null;
    }
    // Falls back to method+path plus a snippet of the raw body when PF's
    // error has no detail/title - a 403 with an unparseable (e.g. HTML)
    // body means this never reached PF's own app layer at all (a gateway/WAF
    // rejection), which is a very different problem than a business-rule 403
    // from PF itself, and "request failed: 403" alone can't tell them apart.
    const fallback = `Property Finder request failed: ${res.status} (${init.method ?? "GET"} ${path})${
      body === null && rawText ? ` - ${rawText.slice(0, 200)}` : ""
    }`;
    throw new PropertyFinderApiError(res.status, body?.detail || body?.title || fallback, body?.code, body?.errors ?? []);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface PFPublicProfile {
  id: number;
  name: string;
  email: string;
}

export interface PFUser {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string;
  status: "active" | "inactive";
  publicProfile: PFPublicProfile | null;
}

export async function listUsers(): Promise<PFUser[]> {
  const data = await pfFetch<{ data: PFUser[] }>("/v1/users?perPage=100");
  return data.data;
}

export interface PFLocation {
  id: number;
  type: string;
  name: string;
  tree: { id: number; type: string; name: string }[];
}

export async function searchLocations(query: string): Promise<PFLocation[]> {
  const data = await pfFetch<{ data: PFLocation[] }>(`/v1/locations?search=${encodeURIComponent(query)}`);
  return data.data;
}

// Only the fields this app actually sends/reads - the full PF schema is far
// larger (see the Enterprise API's request-combined-flat/response-combined-flat
// schemas) but this app only ever needs this subset.
export interface PFListingPayload {
  reference: string;
  category: "residential" | "commercial";
  type: string;
  furnishingType: "furnished" | "unfurnished" | "semi-furnished";
  bathrooms?: string;
  bedrooms?: string;
  size?: number;
  title: { en: string; ar?: string };
  description: { en: string; ar?: string };
  amenities?: string[];
  location: { id: number };
  assignedTo: { id: number };
  price: {
    type: "sale" | "yearly" | "monthly" | "weekly" | "daily";
    amounts: Partial<Record<"sale" | "yearly" | "monthly" | "weekly" | "daily", number>>;
  };
  media: { images: { original: { url: string } }[] };
}

export interface PFListingResponse {
  id: string;
  reference?: string;
  state?: { type: string; stage: string; reasons?: { en: string; ar: string }[] };
}

export async function createListing(payload: PFListingPayload): Promise<PFListingResponse> {
  return pfFetch<PFListingResponse>("/v1/listings", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateListing(pfListingId: string, payload: PFListingPayload): Promise<PFListingResponse> {
  return pfFetch<PFListingResponse>(`/v1/listings/${pfListingId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function getListing(pfListingId: string): Promise<PFListingResponse> {
  return pfFetch<PFListingResponse>(`/v1/listings/${pfListingId}`);
}

export async function publishListing(pfListingId: string): Promise<PFListingResponse> {
  return pfFetch<PFListingResponse>(`/v1/listings/${pfListingId}/publish`, { method: "POST" });
}

export async function unpublishListing(pfListingId: string): Promise<PFListingResponse> {
  return pfFetch<PFListingResponse>(`/v1/listings/${pfListingId}/unpublish`, { method: "POST" });
}

export interface PFCreditBalance {
  total: number;
  remaining: number;
  used: number;
}

// Cheap, real read used as a "test connection" check from the Settings page -
// confirms the stored credentials actually authenticate and gives the admin
// a concrete, meaningful number rather than just a green checkmark. Pass a
// publicProfileId to get that specific agent's own balance instead of the
// whole company's - each Property Finder account has its own credit pool.
export async function getCreditBalance(publicProfileId?: number): Promise<PFCreditBalance> {
  const query = publicProfileId ? `?publicProfileId=${publicProfileId}` : "";
  return pfFetch<PFCreditBalance>(`/v1/credits/balance${query}`);
}

export interface PFCreditsSpentListing {
  listingId: string;
  totalSpent: number;
}

// How many credits a specific listing has consumed over its lifetime
// (publishes, upgrades, etc.) - a listing that exists but never had credits
// spent on it (e.g. a draft) comes back with totalSpent: 0.
export async function getCreditsSpent(listingIds: string[]): Promise<{ listings: PFCreditsSpentListing[]; grandTotal: number }> {
  return pfFetch(`/v1/credits/spent?listingId=${listingIds.map(encodeURIComponent).join(",")}`);
}

export interface PFPublishPriceOption {
  feature: string;
  purchasableProducts: { name: string; price: { type: string; full: number; discount: number; total: number } }[];
}

// The credit cost to publish a DRAFT listing - Property Finder only answers
// this for a listing that already exists there in draft state (404
// otherwise), so this can't be quoted before a listing has been created on
// their side at least once.
export async function getPublishPrice(pfListingId: string): Promise<PFPublishPriceOption[]> {
  return pfFetch(`/v1/listings/${pfListingId}/publish/prices`);
}

export interface PFWebhook {
  eventId: string;
  url: string;
  createdAt: string;
}

export async function listWebhooks(): Promise<PFWebhook[]> {
  const data = await pfFetch<{ data: PFWebhook[] }>("/v1/webhooks");
  return data.data;
}

export async function subscribeWebhook(eventId: string, callbackUrl: string, secret: string): Promise<PFWebhook> {
  return pfFetch<PFWebhook>("/v1/webhooks", {
    method: "POST",
    body: JSON.stringify({ eventId, callbackUrl, secret }),
  });
}
