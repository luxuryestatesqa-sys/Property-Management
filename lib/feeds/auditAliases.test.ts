import { describe, expect, it } from "vitest";
import { auditPublicText } from "./audit";

const agent = { whatsapp: "+974 5000 0000", email: "a@x.qa" };
const base = { area: "The Pearl Island", community: "Porto Arabia", buildingName: "Tower 5", apartmentNumber: "-", ownerName: null, ownerPhone: null, ownerWhatsapp: null, titleDeedNumber: null };

describe("feed checker place names", () => {
  it("does not flag the same place under another name", () => {
    const issues = auditPublicText({ ...base, title: "Sea view", description: "Lovely flat in The Pearl-Qatar close to everything" }, agent);
    expect(issues.filter((i) => i.startsWith("talks about"))).toEqual([]);
  });
  it("does not flag Fox Hills inside a Regency Residence Fox Hills listing", () => {
    const issues = auditPublicText({ ...base, area: "Lusail", community: "Al Erkyah City", pfLocation: null, title: "Fox Hills home", description: "Great Fox Hills apartment" }, agent);
    expect(issues.filter((i) => i.startsWith("talks about"))).toEqual([]);
  });
  it("still flags a genuinely different place", () => {
    const issues = auditPublicText({ ...base, title: "Great flat", description: "Minutes from Lusail Marina" }, agent);
    expect(issues.some((i) => i.startsWith("talks about"))).toBe(true);
  });
  it("does not read a price range as a phone number", () => {
    const issues = auditPublicText({ ...base, title: "R52-1.15M", description: "Offers around R52-1.15M" }, agent);
    expect(issues.some((i) => i.includes("phone"))).toBe(false);
  });
});
