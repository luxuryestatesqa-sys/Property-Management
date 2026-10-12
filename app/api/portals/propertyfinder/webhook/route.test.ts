import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

const findMany = vi.fn();
const ingest = vi.fn();
const secrets: Record<string, string | null> = {};
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@/lib/propertyFinder/auth", () => ({ getWebhookSecret: async (org: string) => secrets[org] ?? null }));
vi.mock("@/lib/leads/ingest", () => ({ ingestPropertyFinderLead: (...a: unknown[]) => ingest(...a) }));

import { POST } from "./route";

const body = JSON.stringify({ type: "lead.created", entity: { id: "L1", type: "lead" }, payload: { publicProfile: { id: 55 } } });
const sign = (secret: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");
const send = (signature?: string) =>
  POST(new NextRequest("http://x/api/portals/propertyfinder/webhook", { method: "POST", body, headers: signature ? { "x-signature": signature } : {} }));

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([{ organizationId: "orgA" }, { organizationId: "orgB" }]);
  ingest.mockReset();
  secrets.orgA = "secret-a";
  secrets.orgB = "secret-b";
});

describe("Property Finder lead webhook", () => {
  it("delivers to the agency whose secret signed it, even if another agency shares the profile id", async () => {
    const res = await send(sign("secret-b"));
    expect(res.status).toBe(200);
    expect(ingest.mock.calls[0][0]).toBe("orgB");
  });

  it("rejects a signature that matches no agency", async () => {
    const res = await send(sign("wrong"));
    expect(res.status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("rejects unsigned requests, and agencies with no secret configured", async () => {
    secrets.orgA = null;
    secrets.orgB = null;
    expect((await send()).status).toBe(401);
    expect((await send(sign("anything"))).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });
});
