import { describe, it, expect } from "vitest";
import { buildDescription, buildMessages, callToAction, cleanTitle, parseAndFinish, stripEmojis, DESCRIPTION_MAX, TITLE_MAX } from "./listingCopy";

describe("stripEmojis", () => {
  it("removes emojis and joiners but keeps normal text", () => {
    expect(stripEmojis("Lovely home 🏡✨ near the sea 🌊")).toBe("Lovely home  near the sea ");
    expect(stripEmojis("Family 👨‍👩‍👧 friendly")).not.toMatch(/[\u{1F300}-\u{1FAFF}‍]/u);
  });

  it("leaves Arabic text untouched", () => {
    expect(stripEmojis("شقة فسيحة في الدوحة")).toBe("شقة فسيحة في الدوحة");
  });
});

describe("cleanTitle", () => {
  it("strips quotes, emojis and a trailing full stop", () => {
    expect(cleanTitle('"Spacious 2 Bedroom Apartment in West Bay." 🏙️')).toBe("Spacious 2 Bedroom Apartment in West Bay");
  });

  it("never exceeds the title limit and cuts at a word", () => {
    const t = cleanTitle("Beautifully furnished luxury two bedroom apartment with panoramic sea views in West Bay Lagoon");
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t.endsWith(" ")).toBe(false);
    expect("Beautifully furnished luxury two bedroom apartment with panoramic sea views in West Bay Lagoon").toContain(t);
  });
});

describe("buildDescription", () => {
  const name = "Ahmed Ali";
  const phone = "+974 5555 1234";

  it("ends with the agent's name and phone call to action", () => {
    const d = buildDescription("A bright apartment.\n\nClose to the metro.", "en", name, phone);
    expect(d.endsWith(callToAction("en", name, phone))).toBe(true);
    expect(d).toContain(name);
    expect(d).toContain(phone);
  });

  it("uses an Arabic call to action for Arabic copy", () => {
    expect(buildDescription("شقة مشرقة.", "ar", name, phone)).toContain("تواصل مع");
  });

  it("strips emojis and markdown from the body", () => {
    const d = buildDescription("**Great** home 🏡\n- near shops\n# Heading", "en", name, phone);
    expect(d).not.toMatch(/\*|#|🏡/);
    expect(d).toContain("near shops");
  });

  it("stays within the description limit and keeps the call to action when the body is too long", () => {
    const long = "This is a sentence about the property. ".repeat(200);
    const d = buildDescription(long, "en", name, phone);
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(d.endsWith(callToAction("en", name, phone))).toBe(true);
  });
});

describe("parseAndFinish", () => {
  it("returns a cleaned title and description from the model's JSON", () => {
    const out = parseAndFinish(JSON.stringify({ title: "Modern 1BR in Lusail 🌇", description: "Bright and spacious. ✨" }), "en", "Sara", "+974 1");
    expect(out.title).toBe("Modern 1BR in Lusail");
    expect(out.description).toContain("Bright and spacious.");
    expect(out.description).toContain("contact Sara on +974 1");
  });

  it("rejects unreadable or incomplete answers", () => {
    expect(() => parseAndFinish("not json", "en", "A", "1")).toThrow(/unreadable/);
    expect(() => parseAndFinish(JSON.stringify({ title: "x" }), "en", "A", "1")).toThrow(/title and description/);
  });
});

describe("buildMessages", () => {
  const base = {
    lang: "en" as const,
    listingType: "RENT" as const,
    category: "Apartment",
    bedrooms: "2 Bedroom",
    bathrooms: "2",
    sizeSqm: 120,
    furnished: "FURNISHED" as const,
    area: "Lusail",
    community: "Marina District",
    locationLabel: "Marina District, Lusail",
    amenities: ["Balcony"],
    agentName: "Ahmed Ali",
    agentPhone: "+974 5555 1234",
  };

  it("gives the model the facts but never the agent's phone number", () => {
    const { user, system } = buildMessages(base);
    expect(user).toContain("2 Bedroom");
    expect(user).toContain("Marina District");
    expect(user + system).not.toContain("5555");
  });

  it("forbids emojis and building/unit details in the instructions", () => {
    const { system } = buildMessages(base);
    expect(system).toMatch(/No emojis/);
    expect(system).toMatch(/building name, floor number, unit number/);
  });
});
