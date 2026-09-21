export function formatQAR(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `QAR ${Math.round(value).toLocaleString("en-US")}`;
}

export function formatCompactQAR(value: number): string {
  if (value >= 1_000_000) return `QAR ${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `QAR ${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return `QAR ${value}`;
}

export function formatSqm(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("en-US")} sqm`;
}

export function listingCode(id: number): string {
  return `LST-${String(id).padStart(6, "0")}`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const datePart = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart}, ${timePart}`;
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
