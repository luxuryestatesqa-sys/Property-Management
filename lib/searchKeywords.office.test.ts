import { describe, it, expect } from "vitest";
import { parseBareBedroomQuery, parseBedroomKeywords } from "./searchKeywords";

describe("1 + Office search", () => {
  it("finds it from an explicit office query", () => {
    expect(parseBareBedroomQuery("1 + office")).toEqual(["ONE_PLUS_OFFICE"]);
    expect(parseBareBedroomQuery("1br office")).toEqual(["ONE_PLUS_OFFICE"]);
    expect(parseBedroomKeywords("lusail 1 bedroom + office")).toEqual(["ONE_PLUS_OFFICE"]);
  });

  it("includes it when searching a bare 1-bedroom", () => {
    expect(parseBareBedroomQuery("1")).toEqual(["ONE", "ONE_PLUS_OFFICE"]);
  });

  it("does not invent an office variant for other counts", () => {
    expect(parseBareBedroomQuery("2 + office")).toBeNull();
  });
});
