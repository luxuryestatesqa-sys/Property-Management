// "just now", "5 min ago", "3 h ago", "2 d ago", then a short date.
export function timeAgo(iso: string | Date, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(t).toLocaleDateString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short" });
}

// "11 Oct 2026, 3:40 PM" in Qatar time. Use this (or timeOfDay) everywhere a date or time is written out, so the
// same moment never reads two different ways.
export function fullDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

export function timeOfDay(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Qatar", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}
