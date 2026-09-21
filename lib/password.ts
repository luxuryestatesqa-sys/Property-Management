// Generates a short, readable temporary password for admin-initiated resets.
// Avoids visually ambiguous characters (0/O, 1/l/I) since it's often read
// off a screen and retyped or copy-pasted into a WhatsApp message.
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 10): string {
  let out = "";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    out += CHARS[bytes[i] % CHARS.length];
  }
  return out;
}
