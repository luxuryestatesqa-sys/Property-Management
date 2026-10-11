import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "crypto";
import { decryptSecret, encryptSecret, signValue, verifyValue } from "../crypto";
import { appSecretProof, parseSignedRequest, verifyWebhookSignature } from "./signature";
import { normalizeMetaLead, platformLabel } from "./mapping";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-for-unit-tests";
});

describe("encryption and signed values", () => {
  it("encrypts a token, reads it back, and never stores it in the clear", () => {
    const stored = encryptSecret("EAAB-page-token");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("EAAB");
    expect(decryptSecret(stored)).toBe("EAAB-page-token");
    expect(encryptSecret("EAAB-page-token")).not.toBe(stored); // fresh iv each time
  });

  it("refuses a tampered or garbage secret", () => {
    const parts = encryptSecret("abc").split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
    expect(() => decryptSecret("nonsense")).toThrow();
  });

  it("signs a value, verifies it, and rejects tampering and expiry", () => {
    const token = signValue({ org: "o1", user: "u1" }, 60);
    expect(verifyValue<{ org: string }>(token)?.org).toBe("o1");
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ org: "o2", user: "u1", exp: 9999999999 })).toString("base64url");
    expect(verifyValue(`${forged}.${sig}`)).toBeNull();
    expect(verifyValue(`${body}.bad`)).toBeNull();
    expect(verifyValue(signValue({ org: "o1" }, -5))).toBeNull(); // already expired
    expect(verifyValue(null)).toBeNull();
  });
});

describe("Meta signatures", () => {
  const secret = "app-secret";
  const body = '{"object":"page"}';
  const sign = (b: string, s = secret) => `sha256=${createHmac("sha256", s).update(b).digest("hex")}`;

  it("accepts only a webhook signed with the app secret", () => {
    expect(verifyWebhookSignature(body, sign(body), secret)).toBe(true);
    expect(verifyWebhookSignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyWebhookSignature(body + " ", sign(body), secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zz", secret)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), "")).toBe(false);
  });

  it("reads a signed_request from the deauthorize / data-deletion callbacks", () => {
    const payload = Buffer.from(JSON.stringify({ user_id: "123" })).toString("base64url");
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    expect(parseSignedRequest<{ user_id: string }>(`${sig}.${payload}`, secret)?.user_id).toBe("123");
    expect(parseSignedRequest(`${sig}.${payload}`, "wrong")).toBeNull();
    expect(parseSignedRequest("garbage", secret)).toBeNull();
    expect(parseSignedRequest(undefined, secret)).toBeNull();
  });

  it("makes an appsecret_proof", () => {
    expect(appSecretProof("tok", secret)).toBe(createHmac("sha256", secret).update("tok").digest("hex"));
  });
});

describe("normalizeMetaLead", () => {
  it("maps a standard lead form, including Meta's p: phone prefix", () => {
    const n = normalizeMetaLead({
      id: "L1",
      created_time: "2026-10-11T09:30:00+0000",
      platform: "ig",
      field_data: [
        { name: "full_name", values: ["Sara Ali"] },
        { name: "email", values: ["Sara@Example.com"] },
        { name: "phone_number", values: ["p:+97455500001"] },
        { name: "city", values: ["Lusail"] },
        { name: "what_is_your_budget?", values: ["QAR 9,000"] },
      ],
    });
    expect(n).toMatchObject({ externalId: "L1", name: "Sara Ali", email: "sara@example.com", phone: "+97455500001", region: "Lusail", platformLabel: "Instagram" });
    expect(n.receivedAt.toISOString()).toBe("2026-10-11T09:30:00.000Z");
  });

  it("builds a name from first and last, finds an area in a custom question, and copes with missing data", () => {
    const n = normalizeMetaLead({ id: "L2", field_data: [{ name: "first_name", values: ["Omar"] }, { name: "last_name", values: ["Haddad"] }, { name: "preferred_area", values: ["The Pearl"] }, { name: "phone_number", values: ["+97455500002"] }] });
    expect(n).toMatchObject({ name: "Omar Haddad", region: "The Pearl", phone: "+97455500002" });
    expect(normalizeMetaLead({ id: "L3" })).toMatchObject({ name: "Facebook lead", phone: null, email: null, region: null });
    expect(normalizeMetaLead({ id: "L4", created_time: "not a date" }).receivedAt).toBeInstanceOf(Date);
  });

  it("labels the platform", () => {
    expect(platformLabel("fb")).toBe("Facebook");
    expect(platformLabel("ig")).toBe("Instagram");
    expect(platformLabel(undefined)).toBe("Facebook / Instagram");
  });
});
