import { describe, expect, it } from "vitest";
import { rateLimited } from "./rateLimit";

describe("rateLimited", () => {
  it("blocks after the maximum within the window and recovers after it", () => {
    const t = 1_000_000;
    expect(rateLimited("a", 2, 1000, t)).toBe(false);
    expect(rateLimited("a", 2, 1000, t + 1)).toBe(false);
    expect(rateLimited("a", 2, 1000, t + 2)).toBe(true);
    expect(rateLimited("b", 2, 1000, t + 2)).toBe(false);
    expect(rateLimited("a", 2, 1000, t + 2000)).toBe(false);
  });
});
