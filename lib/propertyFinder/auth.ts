import { prisma } from "@/lib/prisma";

// Property Finder Enterprise API is server-to-server only (their own usage
// restriction) - never call this from client code, and never expose the
// stored API key/secret to the browser.
export const PF_BASE_URL = "https://atlas.propertyfinder.com";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;

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

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  // Credentials live in the database (managed from the admin Settings page)
  // rather than env vars, so an admin can configure/rotate them without a
  // deploy. See prisma/schema.prisma's PortalCredential model.
  const credential = await prisma.portalCredential.findUnique({ where: { portal: "PROPERTY_FINDER" } });
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
  cached = { accessToken: data.accessToken, expiresAt: Date.now() + data.expiresIn * 1000 };
  return cached.accessToken;
}

// Exposed for tests / a forced re-fetch after a credential rotation.
export function clearCachedToken() {
  cached = null;
}

export async function getWebhookSecret(): Promise<string | null> {
  const credential = await prisma.portalCredential.findUnique({ where: { portal: "PROPERTY_FINDER" } });
  return credential?.webhookSecret ?? null;
}
