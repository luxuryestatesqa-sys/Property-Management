// One-time clean-up of existing leads. Dry run by default (prints what it would do); add --apply to write.
//
//   DATABASE_URL=<db> npx tsx scripts/fix-lead-data.ts            # preview
//   DATABASE_URL=<db> npx tsx scripts/fix-lead-data.ts --apply    # do it
//
// 1. Imported leads whose name is the same words twice ("Iqbal ahmed Iqbal ahmed") -> one copy.
// 2. The "Deal Closed" stage is merged into "Won" (its leads move, the stage is removed).
// 3. Backfills Lead.sourceLabel: Facebook / Instagram from the stored platform, Property Finder, Manual.
// 4. Removes the test lead group "aa".
import { PrismaClient } from "@prisma/client";
import { collapseDoubledName } from "../lib/leads/csv";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const say = (m: string) => console.log(`${apply ? "" : "[dry run] "}${m}`);

async function main() {
  // 1. doubled names
  const imported = await prisma.lead.findMany({ where: { source: "IMPORT" }, select: { id: true, name: true } });
  const doubled = imported.filter((l) => collapseDoubledName(l.name) !== l.name);
  say(`names: ${doubled.length} imported leads have a doubled name`);
  if (apply) for (const l of doubled) await prisma.lead.update({ where: { id: l.id }, data: { name: collapseDoubledName(l.name) } });

  // 2. Won + Deal Closed -> Won
  for (const org of await prisma.organization.findMany({ select: { id: true, name: true } })) {
    const stages = await prisma.leadStage.findMany({ where: { organizationId: org.id }, orderBy: { position: "asc" } });
    const closed = stages.find((s) => s.name === "Deal Closed");
    if (!closed) continue;
    let won = stages.find((s) => s.name === "Won");
    const n = await prisma.lead.count({ where: { stageId: closed.id } });
    say(`stages (${org.name}): merging "Deal Closed" (${n} leads) into "Won"`);
    if (!apply) continue;
    if (!won) won = await prisma.leadStage.update({ where: { id: closed.id }, data: { name: "Won" } });
    else {
      await prisma.lead.updateMany({ where: { stageId: closed.id }, data: { stageId: won.id } });
      await prisma.leadStage.delete({ where: { id: closed.id } });
    }
    const left = await prisma.leadStage.findMany({ where: { organizationId: org.id }, orderBy: { position: "asc" } });
    for (const [i, s] of left.entries()) if (s.position !== i) await prisma.leadStage.update({ where: { id: s.id }, data: { position: i } });
  }

  // 3. source labels
  const meta = await prisma.lead.findMany({ where: { source: "META", sourceLabel: null }, select: { id: true, raw: true } });
  say(`source: ${meta.length} Facebook/Instagram leads, plus Property Finder and manual leads, get a source label`);
  if (apply) {
    for (const l of meta) {
      const p = String((l.raw as { platform?: string } | null)?.platform ?? "Facebook / Instagram");
      await prisma.lead.update({ where: { id: l.id }, data: { sourceLabel: p } });
    }
    await prisma.lead.updateMany({ where: { source: "PROPERTY_FINDER", sourceLabel: null }, data: { sourceLabel: "Property Finder" } });
    await prisma.lead.updateMany({ where: { source: "MANUAL", sourceLabel: null }, data: { sourceLabel: "Manual" } });
  }
  say(`source: ${await prisma.lead.count({ where: { source: "IMPORT", sourceLabel: null } })} imported leads have no recorded origin (the file did not say); set it from the lead list or leave as "Import"`);

  // 4. test group
  const test = await prisma.leadGroup.findMany({ where: { name: "aa" }, select: { id: true } });
  say(`groups: removing ${test.length} test group(s) named "aa"`);
  if (apply && test.length) await prisma.leadGroup.deleteMany({ where: { id: { in: test.map((g) => g.id) } } });
}

main().finally(() => prisma.$disconnect());
