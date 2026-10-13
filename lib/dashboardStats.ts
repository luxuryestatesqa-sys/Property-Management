// Pure helpers for the dashboard numbers (kept apart from the route so they can be tested).

export type PortalStatus = "PUBLISHED" | "NOT_PUBLISHED" | "ERROR";

// A listing's state on one portal, from its PortalListing row (or none).
export function portalStatus(row: { enabled: boolean; remoteListingId: string | null; state: string | null; lastError: string | null } | null | undefined): PortalStatus {
  if (!row) return "NOT_PUBLISHED";
  if (row.lastError) return "ERROR";
  if (row.enabled && (row.remoteListingId || (row.state && !/draft|takendown|archived|unpublished/i.test(row.state)))) return "PUBLISHED";
  return "NOT_PUBLISHED";
}

// Average of the given millisecond gaps, in minutes (null when there is nothing to average).
export function averageMinutes(gapsMs: number[]): number | null {
  const ok = gapsMs.filter((g) => Number.isFinite(g) && g >= 0);
  return ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length / 60000) : null;
}

export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// "45 min", "3 h 10 min", "2 d 4 h"
export function formatMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}
