import { describe, it, expect } from "vitest";
import { pickLeastLoaded, shareOf } from "./rules";

describe("round robin shares", () => {
  it("reads a share as a whole number from 1 to 10, defaulting to 1", () => {
    expect(shareOf({ a: 3 }, "a")).toBe(3);
    expect(shareOf({ a: 0 }, "a")).toBe(1);
    expect(shareOf({ a: 99 }, "a")).toBe(10);
    expect(shareOf({ a: 2.6 }, "a")).toBe(3);
    expect(shareOf({ a: "x" }, "a")).toBe(1);
    expect(shareOf(null, "a")).toBe(1);
    expect(shareOf({}, "missing")).toBe(1);
  });

  it("with equal shares, the agent with the fewest open leads is next", () => {
    expect(pickLeastLoaded(["a", "b"], new Map([["a", 4], ["b", 2]]), {})).toBe("b");
  });

  it("an agent with a bigger share carries more open leads before they stop being next", () => {
    const shares = { ali: 3, sara: 1 };
    // 4 open for Ali = 1.33 per share, 2 open for Sara = 2 per share: Ali is still next
    expect(pickLeastLoaded(["ali", "sara"], new Map([["ali", 4], ["sara", 2]]), shares)).toBe("ali");
    // 7 open for Ali = 2.33 per share, 2 for Sara = 2: now Sara
    expect(pickLeastLoaded(["ali", "sara"], new Map([["ali", 7], ["sara", 2]]), shares)).toBe("sara");
  });

  it("a tie goes to the agent with the bigger share", () => {
    expect(pickLeastLoaded(["sara", "ali"], new Map(), { ali: 3, sara: 1 })).toBe("ali");
  });

  it("over many leads the split follows the shares", () => {
    const shares = { ali: 3, sara: 1 };
    const open = new Map([["ali", 0], ["sara", 0]]);
    const got = { ali: 0, sara: 0 };
    for (let i = 0; i < 40; i++) {
      const next = pickLeastLoaded(["ali", "sara"], open, shares) as "ali" | "sara";
      open.set(next, open.get(next)! + 1);
      got[next]++;
    }
    expect(got).toEqual({ ali: 30, sara: 10 });
  });
});
