/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma delegates are looked up by model name */
// Copies every row from one Postgres database to another with the same schema,
// e.g. Supabase -> Cloud SQL. It only READS from SOURCE and only WRITES to TARGET.
//
//   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... npx tsx scripts/copy-db.ts [--wipe-target]
//
// The target must already have the schema (`prisma migrate deploy` with DIRECT_URL
// pointed at it). Safe to re-run: rows already present are skipped, or pass
// --wipe-target to empty the target first (never touches the source).
import { PrismaClient, Prisma } from "@prisma/client";

const source = process.env.SOURCE_DATABASE_URL;
const target = process.env.TARGET_DATABASE_URL;
if (!source || !target) throw new Error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL");
if (source === target) throw new Error("Source and target are the same database");

const src = new PrismaClient({ datasourceUrl: source });
const dst = new PrismaClient({ datasourceUrl: target });

// Parents before children, derived from the schema's foreign keys.
function orderedModels() {
  const models = Prisma.dmmf.datamodel.models;
  const deps = new Map<string, Set<string>>();
  for (const m of models) {
    deps.set(m.name, new Set(m.fields.filter((f) => f.relationFromFields?.length && f.type !== m.name).map((f) => f.type)));
  }
  const out: string[] = [];
  while (out.length < models.length) {
    const next = [...deps].filter(([n, d]) => !out.includes(n) && [...d].every((x) => out.includes(x))).map(([n]) => n);
    if (!next.length) throw new Error("Cyclic model dependencies - copy by hand");
    out.push(...next);
  }
  return out;
}

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

// Columns added by newer migrations that the SOURCE may not have yet. They are not read from the
// source; the target fills them from its own column default (e.g. a fresh random share token).
const TARGET_ONLY: Record<string, string[]> = { Listing: ["shareToken"] };

function selectFor(name: string) {
  const skip = TARGET_ONLY[name];
  if (!skip) return undefined;
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === name)!;
  return Object.fromEntries(m.fields.filter((f) => f.kind !== "object" && !skip.includes(f.name)).map((f) => [f.name, true]));
}

function keyFields(name: string): string[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === name)!;
  return m.primaryKey?.fields.length ? [...m.primaryKey.fields] : m.fields.filter((f) => f.isId).map((f) => f.name);
}

async function main() {
  const order = orderedModels();
  if (process.argv.includes("--wipe-target")) {
    for (const name of [...order].reverse()) await (dst as any)[lower(name)].deleteMany({});
    console.log("Target emptied.");
  }
  for (const name of order) {
    const key = lower(name);
    const total: number = await (src as any)[key].count();
    let copied = 0;
    const keys = keyFields(name);
    const orderBy = keys.map((k) => ({ [k]: "asc" }));
    const cursorOf = (r: any) => (keys.length === 1 ? { [keys[0]]: r[keys[0]] } : { [keys.join("_")]: Object.fromEntries(keys.map((k) => [k, r[k]])) });
    let cursor: any;
    // Small pages: listing images are stored as data URLs and can be large.
    while (true) {
      const rows: any[] = await (src as any)[key].findMany({ take: 100, select: selectFor(name), ...(cursor ? { skip: 1, cursor } : {}), orderBy });
      if (!rows.length) break;
      await (dst as any)[key].createMany({ data: rows, skipDuplicates: true });
      copied += rows.length;
      cursor = cursorOf(rows[rows.length - 1]);
    }
    const after: number = await (dst as any)[key].count();
    console.log(`${name.padEnd(18)} source ${total}  copied ${copied}  target now ${after}${after < total ? "  <-- MISMATCH" : ""}`);
  }
  // Rows were inserted with explicit ids, so move each auto-increment counter past them.
  for (const m of Prisma.dmmf.datamodel.models) {
    for (const f of m.fields.filter((x) => x.isId && x.default && typeof x.default === "object" && "name" in x.default && x.default.name === "autoincrement")) {
      await dst.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${m.name}"', '${f.name}'), COALESCE((SELECT MAX("${f.name}") FROM "${m.name}"), 1), (SELECT MAX("${f.name}") IS NOT NULL FROM "${m.name}"))`
      );
      console.log(`Reset ${m.name}.${f.name} counter`);
    }
  }
  console.log("Done. Compare the counts above before switching.");
}

main().finally(() => Promise.all([src.$disconnect(), dst.$disconnect()]));
