import { describe, it, expect, beforeAll } from "vitest";
import { createResetToken, readResetToken, resetTokenMatches } from "./passwordReset";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

describe("password reset token", () => {
  const user = { id: "u1", passwordHash: "hash-a" };

  it("round-trips and matches the current password only", () => {
    const payload = readResetToken(createResetToken(user));
    expect(payload?.uid).toBe("u1");
    expect(resetTokenMatches(payload!, "hash-a")).toBe(true);
    expect(resetTokenMatches(payload!, "hash-b")).toBe(false); // password changed -> link dead
  });

  it("rejects tampered or foreign tokens", () => {
    const t = createResetToken(user);
    expect(readResetToken(t.slice(0, -2) + "xx")).toBeNull();
    expect(readResetToken("garbage")).toBeNull();
    expect(readResetToken(null)).toBeNull();
  });
});
