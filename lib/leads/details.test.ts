import { describe, it, expect } from "vitest";
import { extractLeadDetails, prettyLabel } from "./details";

describe("extractLeadDetails", () => {
  it("reads Meta lead-form answers, skipping what the Contact card already shows", () => {
    const rows = extractLeadDetails({
      raw: {
        form_name: "Lusail Villas",
        platform: "ig",
        field_data: [
          { name: "full_name", values: ["Sara Ali"] },
          { name: "phone_number", values: ["+97455500001"] },
          { name: "what_is_your_budget?", values: ["QAR 12,000"] },
          { name: "preferred_areas", values: ["Lusail", "The Pearl"] },
          { name: "empty_answer", values: [""] },
        ],
      },
    });
    expect(rows).toEqual([
      { label: "What is your budget?", value: "QAR 12,000" },
      { label: "Preferred areas", value: "Lusail, The Pearl" },
      { label: "Form", value: "Lusail Villas" },
      { label: "Platform", value: "ig" },
    ]);
  });

  it("shows Property Finder seller info and formats camelCase, booleans and numbers", () => {
    const rows = extractLeadDetails({ sellerProperty: { propertyType: "Villa", bedrooms: 4, furnished: true, location: { id: 1 }, note: "  " } });
    expect(rows).toEqual([
      { label: "Property type", value: "Villa" },
      { label: "Bedrooms", value: "4" },
      { label: "Furnished", value: "Yes" },
    ]);
  });

  it("handles missing or odd input and removes duplicates", () => {
    expect(extractLeadDetails({})).toEqual([]);
    expect(extractLeadDetails({ raw: "text", sellerProperty: [1, 2] })).toEqual([]);
    expect(extractLeadDetails({ sellerProperty: { budget: "5k" }, raw: { fields: { budget: "5k" } } })).toEqual([{ label: "Budget", value: "5k" }]);
  });

  it("makes readable labels", () => {
    expect(prettyLabel("preferred_move_in_date")).toBe("Preferred move in date");
    expect(prettyLabel("numberOfBedrooms")).toBe("Number of bedrooms");
  });
});
