import { prisma } from "@/lib/prisma";

// Property Finder Enterprise API is server-to-server only (their own usage
// restriction) - never call this from client code, and never expose the
// stored API key/secret to the browser.
export const PF_BASE_URL = "https://atlas.propertyfinder.com";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// One cached token per agency - each agency has its own Property Finder account.
const cached = new Map<string, CachedToken>();

// Tokens are valid for 30 minutes with no refresh-token flow - re-issue
// proactively once under 2 minutes remain, rather than waiting for a request
// to fail with a 401.
const EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000;

export class PropertyFinderNotConfiguredError extends Error {
  constructor() {
    super("Property Finder isn't configured yet - add API credentials in Settings");
    this.name = "PropertyFinderNotConfiguredError";
  }
}

export async function getAccessToken(orgId: string): Promise<string> {
  const hit = cached.get(orgId);
  if (hit && hit.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return hit.accessToken;
  }

  // Credentials live in the database (managed from the admin Settings page)
  // rather than env vars, so an admin can configure/rotate them without a
  // deploy. See prisma/schema.prisma's PortalCredential model.
  const credential = await prisma.portalCredential.findUnique({ where: { organizationId_portal: { organizationId: orgId, portal: "PROPERTY_FINDER" } } });
  if (!credential?.apiKey || !credential?.apiSecret) {
    throw new PropertyFinderNotConfiguredError();
  }

  const res = await fetch(`${PF_BASE_URL}/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ apiKey: credential.apiKey, apiSecret: credential.apiSecret }),
  });
  if (!res.ok) {
    const text = await res.text();
    // eslint-disable-next-line no-console
    console.log(`[PF API] POST /v1/auth/token -> ${res.status}\n  request: {"apiKey":"[redacted]","apiSecret":"[redacted]"}\n  response: ${text.slice(0, 500)}`);
    throw new Error(`Property Finder auth failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { accessToken: string; expiresIn: number };
  // eslint-disable-next-line no-console
  console.log(`[PF API] POST /v1/auth/token -> ${res.status}\n  request: {"apiKey":"[redacted]","apiSecret":"[redacted]"}\n  response: {"accessToken":"[redacted]","expiresIn":${data.expiresIn}}`);
  const fresh = { accessToken: data.accessToken, expiresAt: Date.now() + data.expiresIn * 1000 };
  cached.set(orgId, fresh);
  return fresh.accessToken;
}

// Exposed for tests / a forced re-fetch after a credential rotation.
export function clearCachedToken(orgId: string) {
  cached.delete(orgId);
}

export async function getWebhookSecret(orgId: string): Promise<string | null> {
  const credential = await prisma.portalCredential.findUnique({ where: { organizationId_portal: { organizationId: orgId, portal: "PROPERTY_FINDER" } } });
  return credential?.webhookSecret ?? null;
}
