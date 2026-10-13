// Every kind of activity, with its label, group and a small icon path. Shared by the API and the page.
export type ActivityGroup = "Lead" | "Listing" | "User";

export const ACTIVITY_TYPES: { type: string; label: string; group: ActivityGroup; icon: string }[] = [
  { type: "lead_created", label: "Lead created", group: "Lead", icon: "M12 5v14M5 12h14" },
  { type: "lead_assigned", label: "Lead assigned", group: "Lead", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" },
  { type: "stage_changed", label: "Stage changed", group: "Lead", icon: "M5 12h14M13 6l6 6-6 6" },
  { type: "note_added", label: "Note added", group: "Lead", icon: "M4 4h16v12H8l-4 4zM8 9h8M8 12.5h5" },
  { type: "call_logged", label: "Call logged", group: "Lead", icon: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" },
  { type: "whatsapp_sent", label: "WhatsApp sent", group: "Lead", icon: "M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { type: "document_uploaded", label: "Document uploaded", group: "Lead", icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" },
  { type: "voice_note", label: "Voice note", group: "Lead", icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" },
  { type: "followup_set", label: "Follow-up set", group: "Lead", icon: "M12 6v6l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" },
  { type: "followup_done", label: "Follow-up completed", group: "Lead", icon: "M5 12.5l4.5 4.5L19 7.5" },
  { type: "viewing_scheduled", label: "Viewing scheduled", group: "Lead", icon: "M3 10h18M7 3v4M17 3v4M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" },
  { type: "viewing_completed", label: "Viewing completed", group: "Lead", icon: "M5 12.5l4.5 4.5L19 7.5" },
  { type: "viewing_cancelled", label: "Viewing cancelled", group: "Lead", icon: "M6 6l12 12M18 6 6 18" },
  { type: "property_linked", label: "Property linked", group: "Lead", icon: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" },
  { type: "group_changed", label: "Groups changed", group: "Lead", icon: "M4 6h16M4 12h16M4 18h10" },
  { type: "lead_merged", label: "Lead merged", group: "Lead", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { type: "lead_deleted", label: "Lead deleted", group: "Lead", icon: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" },
  { type: "listing_created", label: "Listing created", group: "Listing", icon: "M12 5v14M5 12h14" },
  { type: "listing_edited", label: "Listing edited", group: "Listing", icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" },
  { type: "listing_status_changed", label: "Listing status changed", group: "Listing", icon: "M5 12h14M13 6l6 6-6 6" },
  { type: "listing_published", label: "Published on portal", group: "Listing", icon: "M12 19V5M5 12l7-7 7 7" },
  { type: "listing_unpublished", label: "Unpublished from portal", group: "Listing", icon: "M12 5v14M19 12l-7 7-7-7" },
  { type: "listing_portal_error", label: "Portal error", group: "Listing", icon: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" },
  { type: "listing_activated", label: "Listing activated", group: "Listing", icon: "M5 12.5l4.5 4.5L19 7.5" },
  { type: "listing_deactivated", label: "Listing deactivated", group: "Listing", icon: "M6 6l12 12M18 6 6 18" },
  { type: "user_login", label: "Signed in", group: "User", icon: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" },
  { type: "user_added", label: "User added", group: "User", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" },
  { type: "role_changed", label: "Role changed", group: "User", icon: "M12 2 3 7v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V7z" },
];

export const TYPE_INFO = new Map(ACTIVITY_TYPES.map((t) => [t.type, t]));
export const typeLabel = (t: string) => TYPE_INFO.get(t)?.label ?? t;

export const PORTAL_NAMES: Record<string, string> = { PROPERTY_FINDER: "Property Finder", QATAR_LIVING: "Qatar Living", PROPERTY_ORYX: "Property Oryx" };

export const SOURCE_FILTERS = [
  { key: "pf", label: "Property Finder" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "manual", label: "Manual" },
] as const;

export interface ActivityRow {
  id: string;
  type: string;
  createdAt: string;
  agentId: string | null;
  agentName: string | null;
  leadId: string | null;
  leadName: string | null;
  leadPhone: string | null;
  listingId: number | null;
  listingName: string | null;
  listingCommunity: string | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  source: string | null;
}


// One short sentence for the Details column.
export function describe(r: Pick<ActivityRow, "type" | "oldValue" | "newValue" | "note">): string {
  const portal = (r.newValue && PORTAL_NAMES[r.newValue]) || r.newValue || "";
  switch (r.type) {
    case "stage_changed":
      return r.oldValue || r.newValue ? `Stage: ${r.oldValue ?? "?"} → ${r.newValue ?? "?"}` : r.note ?? "";
    case "listing_created":
      return "New listing added";
    case "listing_published":
      return `Published on ${portal}`;
    case "listing_unpublished":
      return `Unpublished from ${portal}`;
    case "listing_portal_error":
      return `${portal}: ${r.note ?? "error"}`;
    case "role_changed":
      return `${r.note ?? "User"}: ${r.oldValue ?? "?"} → ${r.newValue ?? "?"}`;
    case "user_added":
      return `${r.note ?? ""}${r.newValue ? ` as ${r.newValue}` : ""}`;
    case "listing_status_changed":
    case "listing_deactivated":
    case "listing_activated":
      return r.oldValue || r.newValue ? `${r.oldValue ?? "?"} → ${r.newValue ?? "?"}` : "";
    case "listing_edited":
      return r.note ? `${r.note.replace(/_CHANGED$/, "").replace(/_/g, " ").toLowerCase()}${r.oldValue || r.newValue ? `: ${r.oldValue ?? "-"} → ${r.newValue ?? "-"}` : ""}`.slice(0, 160) : "";
    default:
      return r.note ?? "";
  }
}
