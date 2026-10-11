import { createHmac, timingSafeEqual } from "crypto";

// Meta signs every webhook it sends with your App Secret: the header is "sha256=<hex hmac of the raw body>".
export function verifyWebhookSignature(rawBody: string, header: string | null | undefined, appSecret: string): boolean {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// The "signed_request" Meta posts to the deauthorize and data-deletion callbacks: "<sig>.<payload>",
// both base64url, the signature being an HMAC-SHA256 of the payload text with your App Secret.
export function parseSignedRequest<T = Record<string, unknown>>(signed: string | null | undefined, appSecret: string): T | null {
  if (!signed || !appSecret) return null;
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// Calls made with a Page token can carry a proof that we also hold the App Secret.
export function appSecretProof(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}
