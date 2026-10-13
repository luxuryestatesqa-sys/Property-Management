import { createHash } from "crypto";
import { signValue, verifyValue } from "@/lib/crypto";

// A reset link carries a signed token (no database table needed): who it is for, when it expires, and a
// fingerprint of the password hash at the time it was issued. Once the password changes the fingerprint no
// longer matches, so every link issued before is dead - a link works exactly once.
export const RESET_TTL_SECONDS = 60 * 60;

const fingerprint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("base64url").slice(0, 22);

export function createResetToken(user: { id: string; passwordHash: string }): string {
  return signValue({ t: "pwreset", uid: user.id, f: fingerprint(user.passwordHash) }, RESET_TTL_SECONDS);
}

export function readResetToken(token: string | null | undefined): { uid: string; f: string } | null {
  const v = verifyValue<{ t?: string; uid?: string; f?: string }>(token);
  if (!v || v.t !== "pwreset" || !v.uid || !v.f) return null;
  return { uid: v.uid, f: v.f };
}

export const resetTokenMatches = (payload: { f: string }, passwordHash: string) => payload.f === fingerprint(passwordHash);
