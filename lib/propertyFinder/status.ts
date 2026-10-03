// One place deciding what a listing's Property Finder status IS, so the
// Portals page, the listing card and the detail panel can't disagree. Keyed on
// Property Finder's own stage (kept current by the status refresh/webhook),
// not just this app's `enabled` flag - which alone left a listing that was
// live on Property Finder showing "ready to publish" whenever the flag was
// false (e.g. published or re-linked outside this page).
export type PfStatusKind =
  | "not_published" // never sent to Property Finder
  | "publishing" // sent, Property Finder still processing it
  | "live"
  | "failed" // publish failed or Property Finder took it down
  | "not_live"; // exists on Property Finder as draft / unpublished / archived

export interface PfStatusInput {
  enabled: boolean;
  state: string | null;
  remoteListingId: string | null;
}

export interface PfStatusView {
  kind: PfStatusKind;
  // True when the listing is (or is about to be) visible on Property Finder.
  active: boolean;
  label: string;
  detail: string;
  tone: "success" | "info" | "danger" | "muted";
}

export function getPfStatus(s: PfStatusInput | null | undefined): PfStatusView {
  if (!s || !s.remoteListingId) {
    return { kind: "not_published", active: false, label: "Not published", detail: "Not on Property Finder yet.", tone: "muted" };
  }
  switch (s.state) {
    case "live":
      return { kind: "live", active: true, label: "Live", detail: "Live on Property Finder.", tone: "success" };
    case "pending_publishing":
      return { kind: "publishing", active: true, label: "Publishing…", detail: "Sent to Property Finder - waiting for it to go live.", tone: "info" };
    case "publishing_failed":
      return { kind: "failed", active: false, label: "Failed", detail: "Property Finder rejected the last publish attempt.", tone: "danger" };
    case "takendown":
      return { kind: "failed", active: false, label: "Taken Down", detail: "Property Finder took this listing down.", tone: "danger" };
    case "draft":
      return { kind: "not_live", active: false, label: "Draft on PF", detail: "On Property Finder as a draft - not live yet.", tone: "muted" };
    case "unpublished":
      return { kind: "not_live", active: false, label: "Unpublished", detail: "Unpublished on Property Finder.", tone: "muted" };
    case "archived":
      return { kind: "not_live", active: false, label: "Archived", detail: "Archived on Property Finder.", tone: "muted" };
    default:
      // State not known yet (or a stage this app doesn't map): fall back to
      // what the agent last asked for.
      return s.enabled
        ? { kind: "publishing", active: true, label: "Publishing…", detail: "Sent to Property Finder - checking its status.", tone: "info" }
        : { kind: "not_live", active: false, label: s.state ? s.state.charAt(0).toUpperCase() + s.state.slice(1) : "Not live", detail: "Not live on Property Finder.", tone: "muted" };
  }
}

export const PF_TONE_COLORS: Record<PfStatusView["tone"], { bg: string; text: string }> = {
  success: { bg: "var(--success-bg)", text: "var(--success)" },
  info: { bg: "var(--accent-light)", text: "var(--primary)" },
  danger: { bg: "var(--danger-bg)", text: "var(--danger)" },
  muted: { bg: "var(--surface-muted)", text: "var(--muted)" },
};
