// A CSV cell. Text that starts with = + - @ (or a tab / carriage return) is run as a formula by Excel and Google
// Sheets, and lead names, notes and sources come from outside (Property Finder, Meta, imports), so such text is
// stored with a leading ' to keep it plain text. Quotes are doubled, and the whole value is quoted.
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
