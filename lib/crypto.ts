import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Secrets we must be able to read back later (Facebook Page access tokens) are stored encrypted,
// so a copy of the database alone is not enough to use them. AES-256-GCM; the key comes from
// TOKEN_ENCRYPTION_KEY (any long random string) or, if that is not set, from AUTH_SECRET.

function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set TOKEN_ENCRYPTION_KEY (or AUTH_SECRET) to store connection tokens securely");
  return scryptSync(secret, "crm-token-encryption-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unreadable secret");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

// Short-lived signed values (the "state" of an OAuth login), so a callback can be trusted to
// come from a login we started.
const b64u = (b: Buffer) => b.toString("base64url");

export function signValue(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = b64u(Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return `${body}.${b64u(createHmac("sha256", secret).update(body).digest())}`;
}

export function verifyValue<T = Record<string, unknown>>(token: string | null | undefined): T | null {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof parsed.exp === "number" && parsed.exp > Date.now() / 1000 ? (parsed as T) : null;
  } catch {
    return null;
  }
}
