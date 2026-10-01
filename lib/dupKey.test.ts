import { describe, it, expect } from "vitest";
import { buildDupKey } from "./dupKey";

describe("buildDupKey", () => {
  it("produces the same key regardless of case", () => {
    expect(buildDupKey("Lusail", "Marina District", "Tower 9", "12", "1204")).toBe(
      buildDupKey("LUSAIL", "marina district", "TOWER 9", "12", "1204")
    );
  });

  it("produces the same key regardless of surrounding or repeated whitespace", () => {
    expect(buildDupKey("  Lusail ", "Marina  District", "Tower   9", "12", "1204")).toBe(
      buildDupKey("Lusail", "Marina District", "Tower 9", "12", "1204")
    );
  });

  it("treats any differing field as a different property", () => {
    const base = buildDupKey("Lusail", "Marina District", "Tower 9", "12", "1204");
    expect(buildDupKey("Lusail", "Marina District", "Tower 9", "12", "1205")).not.toBe(base); // different unit
    expect(buildDupKey("Lusail", "Marina District", "Tower 9", "13", "1204")).not.toBe(base); // different floor
    expect(buildDupKey("Lusail", "Marina District", "Tower 10", "12", "1204")).not.toBe(base); // different building
    expect(buildDupKey("The Pearl", "Marina District", "Tower 9", "12", "1204")).not.toBe(base); // different area
  });

  it("does not let field boundaries bleed into each other", () => {
    // Without a separator, "ab"+"c" and "a"+"bc" would collide - the "|" join prevents that.
    expect(buildDupKey("ab", "c", "x", "1", "1")).not.toBe(buildDupKey("a", "bc", "x", "1", "1"));
  });
});
