// Where to send someone after they sign in. Only an address inside this app is accepted: "/leads" yes,
// "https://evil.example", "//evil.example" or "/\evil.example" no, so a crafted login link cannot send people on
// to another site.
export function safeCallbackPath(candidate: string | null | undefined, fallback: string): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(candidate)) return fallback;
  return candidate;
}
