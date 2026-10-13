// Second one-time clean-up of existing leads. Dry run by default; add --apply to write.
//
//   DATABASE_URL=<db> npx tsx scripts/fix-lead-data-2.ts            # preview
//   DATABASE_URL=<db> npx tsx scripts/fix-lead-data-2.ts --apply    # do it
//
// 1. Leads still in "New" that already have an outbound call, WhatsApp or note move to "Contacted"
//    (logged on the timeline at the time of that first contact, and the first-response time is set).
// 2. Imported leads get a real source: from the same phone/email on a lead whose source is known, else
//    from the import file name, else from a source/platform/channel column in the file, else "Unknown".
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const say = (m: string) => console.log(`${apply ? "" : "[dry run] "}${m}`);

const fromText = (t: string | null | undefined): string | null => {
  const s = (t ?? "").toLowerCase();
  if (/instagram|insta\b|\big\b/.test(s)) return "Instagram";
  if (/facebook|\bfb\b|meta/.test(s)) return "Facebook";
  if (/whats\s?app|\bwa\b/.test(s)) return "WhatsApp";
  if (/property\s?finder|\bpf\b|propertyfinder/.test(s)) return "Property Finder";
  if (/manual|walk.?in|referral/.test(s)) return "Manual";
  return null;
};

async function main() {
  // ---- 1. auto-advance
  for (const org of await prisma.organization.findMany({ select: { id: true, name: true } })) {
    const stages = await prisma.leadStage.findMany({ where: { organizationId: org.id }, orderBy: { position: "asc" } });
    const open = stages.filter((s) => s.kind === "OPEN");
    const first = open[0];
    const next = open.find((s) => s.name.trim().toLowerCase() === "contacted") ?? open[1];
    if (!first || !next || next.id === first.id) continue;
    const leads = await prisma.lead.findMany({
      where: { organizationId: org.id, stageId: first.id, activities: { some: { type: { in: ["NOTE", "CALL_LOGGED", "WHATSAPP_LOGGED"] }, userId: { not: null } } } },
      select: { id: true, firstContactedAt: true, activities: { where: { type: { in: ["NOTE", "CALL_LOGGED", "WHATSAPP_LOGGED"] }, userId: { not: null } }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true, userId: true } } },
    });
    say(`stage (${org.name}): ${leads.length} lead(s) in "${first.name}" already contacted -> "${next.name}"`);
    if (!apply) continue;
    for (const l of leads) {
      const a = l.activities[0];
      await prisma.lead.update({ where: { id: l.id }, data: { stageId: next.id, ...(l.firstContactedAt ? {} : { firstContactedAt: a.createdAt }) } });
      await prisma.leadActivity.create({ data: { organizationId: org.id, leadId: l.id, userId: a.userId, type: "STAGE_CHANGED", text: `Stage: ${first.name} → ${next.name}`, data: { from: first.id, to: next.id, auto: true }, createdAt: new Date(a.createdAt.getTime() + 1000) } });
    }
  }

  // ---- 2. sources for imported leads
  const imported = await prisma.lead.findMany({
    where: { OR: [{ source: "IMPORT" }, { sourceLabel: null }] },
    select: { id: true, source: true, phone: true, email: true, sourceLabel: true, raw: true, activities: { where: { type: "RECEIVED" }, take: 1, select: { text: true } } },
  });
  const todo = imported.filter((l) => l.source === "IMPORT" && (!l.sourceLabel || l.sourceLabel === "Import"));
  const known = await prisma.lead.findMany({ where: { sourceLabel: { not: null }, NOT: { source: "IMPORT" } }, select: { phone: true, email: true, sourceLabel: true } });
  const byPhone = new Map(known.flatMap((k) => (k.phone ? [[k.phone.replace(/^\+/, ""), k.sourceLabel!] as const] : [])));
  const byEmail = new Map(known.flatMap((k) => (k.email ? [[k.email.toLowerCase(), k.sourceLabel!] as const] : [])));
  const tally: Record<string, number> = {};
  const plan = todo.map((l) => {
    const fields = ((l.raw as { fields?: Record<string, string> } | null)?.fields ?? {}) as Record<string, string>;
    const col = Object.entries(fields).find(([k]) => /source|platform|channel|medium|origin/i.test(k));
    const label = (l.phone && byPhone.get(l.phone.replace(/^\+/, ""))) || (l.email && byEmail.get(l.email.toLowerCase())) || fromText(l.activities[0]?.text) || (col ? fromText(col[1]) : null) || "Unknown";
    tally[label] = (tally[label] ?? 0) + 1;
    return { id: l.id, label };
  });
  say(`source: ${todo.length} imported lead(s) -> ${JSON.stringify(tally)}`);
  if (apply) for (const p of plan) await prisma.lead.update({ where: { id: p.id }, data: { sourceLabel: p.label } });
}

main().finally(() => prisma.$disconnect());
