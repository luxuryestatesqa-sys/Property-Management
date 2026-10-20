import { describe, it, expect, vi } from "vitest";
import { ttlCache } from "./ttlCache";

describe("ttlCache", () => {
  it("returns a value until it expires, then forgets it", () => {
    vi.useFakeTimers();
    const c = ttlCache<string>(1000);
    c.set("a", "x");
    expect(c.get("a")).toBe("x");
    vi.advanceTimersByTime(1001);
    expect(c.get("a")).toBeUndefined();
    vi.useRealTimers();
  });
  it("keeps a cached null (a user that does not exist) distinct from a miss", () => {
    const c = ttlCache<null>(1000);
    c.set("gone", null);
    expect(c.get("gone")).toBeNull();
    expect(c.get("other")).toBeUndefined();
  });
  it("never grows past its limit", () => {
    const c = ttlCache<number>(60_000, 3);
    for (let i = 0; i < 10; i++) c.set(String(i), i);
    expect(c.get("0")).toBeUndefined();
    expect(c.get("9")).toBe(9);
  });
});
