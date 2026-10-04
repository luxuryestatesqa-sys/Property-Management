import { describe, it, expect } from "vitest";
import { auditPublicText, type AuditListing } from "./audit";

const AGENT = { whatsapp: "+97466597166", email: "raafe@example.com" };

const BASE: AuditListing = {
  title: "Furnished 2BR in Lusail",
  description: "Bright apartment in Lusail.\n\nTo arrange a viewing, contact Raafe on +97466597166.",
  area: "Lusail",
  community: "Al Erkyah",
  buildingName: "Marina Tower",
  apartmentNumber: "1204",
  ownerName: "Khalid Al Thani",
  ownerPhone: "+97455000111",
  ownerWhatsapp: null,
  titleDeedNumber: "TD-998877",
};

const audit = (description: string, extra: Partial<AuditListing> = {}) => auditPublicText({ ...BASE, description, ...extra }, AGENT);

describe("auditPublicText", () => {
  it("passes clean copy that only has the agent's own number", () => {
    expect(audit(BASE.description!)).toEqual([]);
  });

  it("accepts the agent's number written with spaces or a leading zero", () => {
    expect(audit("Call 066597166 or +974 6659 7166")).toEqual([]);
  });

  it("flags a phone number that isn't the agent's", () => {
    expect(audit("Call the landlord on 5512 3456 now")).toEqual([expect.stringContaining("phone number that isn't the agent's")]);
  });

  it("flags an email that isn't the agent's", () => {
    expect(audit("Write to someone@gmail.com")).toEqual([expect.stringContaining("email address that isn't the agent's")]);
  });

  it("flags the owner's name, number and the title deed number", () => {
    const issues = audit("Owned by Khalid Al Thani, phone +974 5500 0111, deed TD-998877");
    expect(issues).toEqual(expect.arrayContaining([expect.stringContaining("owner's name"), expect.stringContaining("owner's phone"), expect.stringContaining("title deed")]));
  });

  it("flags the building name and the unit number", () => {
    const issues = audit("Located in Marina Tower, apartment 1204.");
    expect(issues).toEqual(expect.arrayContaining(["names the building", "mentions the unit number"]));
  });

  it("flags a description about a different community than the listing's (the LE-36 case)", () => {
    const issues = audit("Situated in the Fox Hills South community, a prime location within Lusail.");
    expect(issues).toEqual([expect.stringContaining("Fox Hills South")]);
    expect(issues[0]).toContain("Lusail / Al Erkyah");
  });

  it("does not flag the listing's own area or community", () => {
    expect(audit("Situated in Al Erkyah, Lusail.")).toEqual([]);
  });

  it("compares the text with the Property Finder location, not the listing's own area/community", () => {
    const pfLocation = {
      id: 1197,
      name: "Al Erkyah City",
      type: "COMMUNITY",
      tree: [
        { id: 4, name: "Lusail", type: "CITY" },
        { id: 1197, name: "Al Erkyah City", type: "COMMUNITY" },
      ],
      latitude: null,
      longitude: null,
    };
    // Matches the PF location even though the listing's own community is different.
    expect(audit("In Al Erkyah, Lusail.", { community: "Fox Hills South", pfLocation })).toEqual([]);
    // Names the listing's old community, which is no longer the published location.
    expect(audit("Situated in Fox Hills South.", { community: "Fox Hills South", pfLocation })).toEqual([
      expect.stringContaining("Lusail / Al Erkyah City"),
    ]);
  });
});
