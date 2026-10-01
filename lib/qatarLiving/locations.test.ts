import { describe, it, expect } from "vitest";
import { resolveQatarLivingLocation } from "./locations";

describe("resolveQatarLivingLocation", () => {
  it("resolves a plain area to its matching QL city + area name", () => {
    const result = resolveQatarLivingLocation("West Bay", "West Bay");
    expect(result.city).toBe("Doha");
    expect(result.area).toBe("West Bay");
    expect(result.latitude).toBeCloseTo(25.325, 1);
  });

  it("prefers the more specific community over its parent area", () => {
    const result = resolveQatarLivingLocation("The Pearl-Qatar", "Porto Arabia");
    expect(result.city).toBe("The Pearl");
    expect(result.area).toBe("Porto Arabia");
  });

  it("is case-insensitive", () => {
    const result = resolveQatarLivingLocation("lusail", "lusail");
    expect(result.city).toBe("Lusail");
  });

  it("falls back to Doha/Other for an unrecognised area", () => {
    const result = resolveQatarLivingLocation("Some New Development", "Some New Development");
    expect(result.city).toBe("Doha");
    expect(result.area).toBe("Other");
  });
});
