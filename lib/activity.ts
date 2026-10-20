import { prisma } from "@/lib/prisma";

// The activity log (Dashboard > Activities). Lead timeline entries, listing audit entries and portal
// publish changes are copied into the Activity table by database triggers (see the activity_log
// migration), so they can never be missed. The few events with no such source are logged here.
export type AppActivityType = "user_login" | "user_added" | "role_changed" | "permissions_changed" | "lead_deleted";

export async function logActivity(
  organizationId: string,
  a: { type: AppActivityType; agentId?: string | null; leadId?: string | null; listingId?: number | null; oldValue?: string | null; newValue?: string | null; note?: string | null; source?: string | null }
) {
  try {
    await prisma.activity.create({ data: { organizationId, type: a.type, agentId: a.agentId ?? null, leadId: a.leadId ?? null, listingId: a.listingId ?? null, oldValue: a.oldValue ?? null, newValue: a.newValue ?? null, note: a.note ?? null, source: a.source ?? null } });
  } catch (e) {
    // Never let logging break the action being logged.
    console.error("activity log failed:", e instanceof Error ? e.message : e);
  }
}
