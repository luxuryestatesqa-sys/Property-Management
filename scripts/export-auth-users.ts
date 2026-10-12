// Writes the users in DATABASE_URL to a JSON file that `firebase auth:import` understands, keeping each
// person's existing password (bcrypt hashes are imported as they are, nobody has to reset anything).
// The Firebase UID is the User.id. The file contains password hashes: keep it out of git and delete it
// after the import.
//
//   DATABASE_URL=<db> npx tsx scripts/export-auth-users.ts <out.json>
//   firebase auth:import <out.json> --hash-algo=BCRYPT --project luxury-estate-crm
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const out = process.argv[2];
if (!out) throw new Error("Usage: export-auth-users.ts <out.json>");
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const rows = users.map((u) => ({
    localId: u.id,
    email: u.email,
    emailVerified: false,
    displayName: u.name,
    disabled: u.status !== "ACTIVE",
    passwordHash: Buffer.from(u.passwordHash, "utf8").toString("base64"),
    createdAt: String(u.createdAt.getTime()),
  }));
  writeFileSync(out, JSON.stringify({ users: rows }));
  const prefixes = [...new Set(users.map((u) => u.passwordHash.slice(0, 4)))].join(", ");
  console.log(`Wrote ${rows.length} users to ${out} (hash formats: ${prefixes})`);
}

main().finally(() => prisma.$disconnect());
