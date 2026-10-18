// Text typed into a search box becomes a database "contains" match, so the characters that mean
// "anything" in a LIKE pattern (% and _) and the escape character itself must be matched literally.
export function escapeLike(s: string): string {
  return s.replace(/[\%_]/g, "\$&");
}

// Collapses runs of spaces so "Aamir  khan" finds "Aamir khan".
export function collapseSpaces(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// The digits of a phone-looking search ("+974 5107", "0097451070512" -> "9745107", "97451070512"),
// or null when the text is a name or an email. Stored numbers are "+974…" or "974…" with no spaces,
// so the digits alone match whichever way the number was written.
export function phoneSearchDigits(q: string): string | null {
  if (!/^[\d\s+().-]+$/.test(q)) return null;
  const digits = q.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 3 ? digits : null;
}
