import { randomUUID } from "crypto";
import type { LeadChannel } from "@prisma/client";
import { tenantDb } from "@/lib/tenant";
import { firstStageId } from "./stages";
import { makeRulePicker } from "./rules";
import { normalizeEmail, normalizePhone, collapseDoubledName } from "./csv";

// Adding leads by hand and importing them from a file share this code: the same checks, the same
// duplicate rules and the same timeline entries. Property Finder leads use ingest.ts instead.

export interface NewLeadInput {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  region?: unknown;
  notes?: unknown;
  channel?: LeadChannel;
  sourceLabel?: string | null; // "Facebook", "WhatsApp"... shown as the lead's source
  receivedAt?: Date | null;
  extra?: Record<string, string>; // other columns from a file, shown under "Enquiry details"
}

export interface IntakeOptions {
  source: "MANUAL" | "IMPORT";
  actor: { id: string; name: string };
  // rules: round robin / region rules. agent: one chosen agent. self: the person adding it. none: Unassigned.
  assign: { mode: "rules" | "agent" | "self" | "none"; agentId?: string };
  stageId?: string;
  fileName?: string;
  allowDuplicates?: boolean; // adding one lead by hand may knowingly repeat a number
}

export interface IntakeResult {
  created: number;
  duplicates: { row: number; name: string; reason: string }[];
  invalid: { row: number; reason: string }[];
  leadIds: string[];
}

const text = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export class IntakeError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// `rowOffset` is the spreadsheet row of the first input (2 for a file with a header), so the
// problems we report match what the person sees in their file.
export async function createLeads(orgId: string, inputs: NewLeadInput[], opts: IntakeOptions, rowOffset = 1): Promise<IntakeResult> {
  const db = tenantDb(orgId);
  const result: IntakeResult = { created: 0, duplicates: [], invalid: [], leadIds: [] };

  // 1. Clean each row; drop the ones with nothing to contact.
  const clean: { row: number; sourceLabel: string | null; name: string; phone: string | null; email: string | null; region: string | null; notes: string | null; channel: LeadChannel; receivedAt: Date; extra: Record<string, string> }[] = [];
  inputs.forEach((r, i) => {
    const row = i + rowOffset;
    const phone = normalizePhone(r.phone);
    const email = normalizeEmail(r.email);
    const name = collapseDoubledName(text(r.name, 120)) || phone || email || "";
    if (!phone && !email) return result.invalid.push({ row, reason: text(r.phone, 30) ? "The phone number isn't valid" : "No phone number or email" });
    clean.push({
      row,
      name,
      phone,
      email,
      region: text(r.region, 120) || null,
      notes: text(r.notes, 2000) || null,
      channel: r.channel ?? "OTHER",
      sourceLabel: r.sourceLabel ? text(r.sourceLabel, 40) : null,
      receivedAt: r.receivedAt && r.receivedAt.getTime() <= Date.now() + 86400000 ? r.receivedAt : new Date(),
      extra: r.extra ?? {},
    });
  });

  // 2. Skip people we already have (same phone or email), and repeats inside the file.
  let fresh = clean;
  if (!opts.allowDuplicates && clean.length) {
    const phones = [...new Set(clean.flatMap((c) => (c.phone ? [c.phone, c.phone.replace(/^\+/, ""), `+${c.phone.replace(/^\+/, "")}`] : [])))];
    const emails = [...new Set(clean.flatMap((c) => (c.email ? [c.email] : [])))];
    const existing = await db.lead.findMany({ where: { OR: [...(phones.length ? [{ phone: { in: phones } }] : []), ...(emails.length ? [{ email: { in: emails, mode: "insensitive" as const } }] : [])] }, select: { phone: true, email: true } });
    const havePhone = new Set(existing.flatMap((l) => (l.phone ? [l.phone.replace(/^\+/, "")] : [])));
    const haveEmail = new Set(existing.flatMap((l) => (l.email ? [l.email.toLowerCase()] : [])));
    fresh = [];
    for (const c of clean) {
      const key = c.phone?.replace(/^\+/, "");
      const dupPhone = key && havePhone.has(key);
      const dupEmail = c.email && haveEmail.has(c.email);
      if (dupPhone || dupEmail) {
        result.duplicates.push({ row: c.row, name: c.name, reason: dupPhone ? "This phone number is already a lead" : "This email is already a lead" });
        continue;
      }
      if (key) havePhone.add(key);
      if (c.email) haveEmail.add(c.email);
      fresh.push(c);
    }
  }
  if (fresh.length === 0) return result;

  // 3. Who gets them?
  const stageId = opts.stageId ? (await db.leadStage.findFirst({ where: { id: opts.stageId } }))?.id : await firstStageId(orgId);
  if (!stageId) throw new IntakeError("Unknown stage", 404);
  let fixed: { id: string; name: string } | null = null;
  if (opts.assign.mode === "agent") {
    fixed = (await db.user.findFirst({ where: { id: opts.assign.agentId ?? "", status: "ACTIVE" }, select: { id: true, name: true } })) ?? null;
    if (!fixed) throw new IntakeError("Unknown agent", 404);
  } else if (opts.assign.mode === "self") fixed = opts.actor;
  const pick = opts.assign.mode === "rules" ? await makeRulePicker(orgId) : null;
  const names = new Map<string, string>();
  const plan = fresh.map((c) => {
    if (fixed) return { to: fixed.id, why: `Assigned to ${fixed.name}` };
    const m = pick?.({ region: c.region });
    return m ? { to: m.userId, why: `Assigned by rule “${m.ruleName}”` } : { to: null as string | null, why: "" };
  });
  const need = [...new Set(plan.flatMap((p) => (p.to && !fixed ? [p.to] : [])))];
  if (need.length) for (const u of await db.user.findMany({ where: { id: { in: need } }, select: { id: true, name: true } })) names.set(u.id, u.name);

  // 4. Save, then write each lead's first timeline entries.
  const created = await db.lead.createManyAndReturn({
    data: fresh.map((c, i) => ({
      organizationId: orgId,
      source: opts.source,
      externalId: `${opts.source.toLowerCase()}-${randomUUID()}`,
      name: c.name,
      phone: c.phone,
      email: c.email,
      region: c.region,
      channel: c.channel,
      sourceLabel: c.sourceLabel,
      stageId,
      assignedToId: plan[i].to,
      receivedAt: c.receivedAt,
      ...(Object.keys(c.extra).length ? { raw: { fields: c.extra } } : {}),
    })),
    select: { id: true },
  });
  const by = opts.actor.id;
  const origin = opts.source === "IMPORT" ? `Imported${opts.fileName ? ` from ${text(opts.fileName, 80)}` : ""} by ${opts.actor.name}` : `Added by ${opts.actor.name}`;
  await db.leadActivity.createMany({
    data: created.flatMap((l, i) => [
      { organizationId: orgId, leadId: l.id, userId: by, type: "RECEIVED", text: origin },
      ...(plan[i].to ? [{ organizationId: orgId, leadId: l.id, userId: by, type: "ASSIGNED", text: plan[i].why || `Assigned to ${names.get(plan[i].to!) ?? "an agent"}`, data: { to: plan[i].to } }] : []),
      ...(fresh[i].notes ? [{ organizationId: orgId, leadId: l.id, userId: by, type: "NOTE", text: fresh[i].notes }] : []),
    ]),
  });
  result.created = created.length;
  result.leadIds = created.map((l) => l.id);
  return result;
}
