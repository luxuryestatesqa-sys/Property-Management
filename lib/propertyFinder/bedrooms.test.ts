import { describe, expect, it } from "vitest";
import { PF_BEDROOMS, withLayoutAmenities } from "./mapping";

describe("Property Finder bedrooms", () => {
  it("sends the real bedroom count for + Maid and + Office layouts", () => {
    expect(PF_BEDROOMS.TWO_PLUS_MAID).toBe("2");
    expect(PF_BEDROOMS.THREE_PLUS_MAID).toBe("3");
    expect(PF_BEDROOMS.FOUR_PLUS_MAID).toBe("4");
    expect(PF_BEDROOMS.FIVE_PLUS_MAID).toBe("5");
    expect(PF_BEDROOMS.ONE_PLUS_OFFICE).toBe("1");
    expect(PF_BEDROOMS.STUDIO).toBe("studio");
  });

  it("adds the maid's room or study as an amenity once", () => {
    expect(withLayoutAmenities(["balcony"], "TWO_PLUS_MAID")).toEqual(["balcony", "maids-room"]);
    expect(withLayoutAmenities(["maids-room"], "FOUR_PLUS_MAID")).toEqual(["maids-room"]);
    expect(withLayoutAmenities([], "ONE_PLUS_OFFICE")).toEqual(["study"]);
    expect(withLayoutAmenities(["balcony"], "TWO")).toEqual(["balcony"]);
    expect(withLayoutAmenities(["balcony"], null)).toEqual(["balcony"]);
  });
});

describe("pfLayoutNote", () => {
  it("explains what Property Finder receives for + Maid / + Office, and is silent otherwise", async () => {
    const { pfLayoutNote } = await import("./mapping");
    expect(pfLayoutNote("TWO_PLUS_MAID")).toContain("2 bedrooms and the Maid's Room amenity");
    expect(pfLayoutNote("ONE_PLUS_OFFICE")).toContain("Study");
    expect(pfLayoutNote("TWO")).toBeNull();
    expect(pfLayoutNote(null)).toBeNull();
  });
});
