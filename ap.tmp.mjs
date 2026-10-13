import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
const p = new PrismaClient();
const text = readFileSync(process.argv[2], "utf8").replace(/^--.*$/gm, "");
const stmts = []; let cur = ""; let inD = false;
for (const line of text.split("\n")) {
  cur += line + "\n";
  inD = (line.match(/\$\$/g) || []).length % 2 ? !inD : inD;
  if (!inD && /;\s*$/.test(line)) { if (cur.trim()) stmts.push(cur.trim()); cur = ""; }
}
const before = await p.$queryRawUnsafe('SELECT (SELECT count(*)::int FROM "LeadActivity") la, (SELECT count(*)::int FROM "Activity") a, (SELECT count(*)::int FROM "LeadTask") t');
for (const s of stmts) { try { await p.$executeRawUnsafe(s.replace(/;\s*$/, "")); } catch (e) { console.log("ERR", s.slice(0, 70), e.message.slice(0, 160)); } }
const after = await p.$queryRawUnsafe('SELECT (SELECT count(*)::int FROM "LeadActivity") la, (SELECT count(*)::int FROM "Activity") a, (SELECT count(*)::int FROM "LeadTask") t');
console.log("applied", stmts.length, before, after);
await p.$disconnect();
