import { describe, it, expect } from "vitest";
import { normalizePfLead, listingIdFromReference, channelOf } from "./pfMapping";

describe("normalizePfLead", () => {
  it("maps a WhatsApp listing lead", () => {
    const n = normalizePfLead({
      id: "wa_lead_1",
      entityType: "listing",
      channel: "whatsapp",
      status: "sent",
      publicProfile: { id: 4455 },
      sender: { name: " Jane Doe ", contacts: [{ type: "phone", value: "+97455512345" }, { type: "email", value: "jane@x.test" }] },
      listing: { id: "01ABC", reference: "LE-123" },
      responseLink: "https://example.com/r",
      tags: ["hot"],
      createdAt: "2026-10-01T10:00:00Z",
    });
    expect(n).toMatchObject({
      externalId: "wa_lead_1",
      channel: "WHATSAPP",
      name: "Jane Doe",
      phone: "+97455512345",
      email: "jane@x.test",
      pfPublicProfileId: 4455,
      listingReference: "LE-123",
      pfListingId: "01ABC",
      tags: ["hot"],
    });
    expect(n.receivedAt?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });

  it("maps a call lead with recording details", () => {
    const n = normalizePfLead({ id: "c1", channel: "call", sender: { contacts: [{ type: "phone", value: "+9741" }] }, call: { talkTime: 95, waitTime: 8, recordFile: "https://x/rec.mp3" } });
    expect(n.channel).toBe("CALL");
    expect(n.callTalkTime).toBe(95);
    expect(n.callRecordUrl).toBe("https://x/rec.mp3");
    expect(n.name).toBe("+9741"); // falls back to the phone when no name was given
  });

  it("copes with sparse webhook payloads (no createdAt, no listing)", () => {
    const n = normalizePfLead({ id: "w1", entityType: "project", channel: "email", sender: { name: "A", contacts: [] } });
    expect(n.receivedAt).toBeNull();
    expect(n.listingReference).toBeNull();
    expect(n.phone).toBeNull();
    expect(n.channel).toBe("EMAIL");
  });

  it("falls back for unknown channels and nameless senders", () => {
    expect(channelOf("sms")).toBe("OTHER");
    expect(normalizePfLead({ id: "x" }).name).toBe("Unknown contact");
  });
});

describe("listingIdFromReference", () => {
  it("reads our own LE-<id> references only", () => {
    expect(listingIdFromReference("LE-76")).toBe(76);
    expect(listingIdFromReference("PF-76")).toBeNull();
    expect(listingIdFromReference("LE-")).toBeNull();
    expect(listingIdFromReference(null)).toBeNull();
  });
});
