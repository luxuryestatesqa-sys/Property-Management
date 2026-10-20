// Moves listing photos that are still stored as data URLs in Postgres into the PHOTO_BUCKET bucket and
// replaces ListingImage.url with a "gcs:" pointer. Safe to re-run: rows already moved are skipped, and the
// database row is only changed after the upload succeeded. Add --dry-run to count without changing anything.
//
//   DATABASE_URL=... PHOTO_BUCKET=luxury-estate-crm-photos npx tsx scripts/migrate-photos-to-bucket.ts [--dry-run]
//
// Needs Google credentials with write access to the bucket (gcloud auth application-default login).
import { PrismaClient } from "@prisma/client";
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
import { dataUrlToBuffer } from "../lib/image";

const dry = process.argv.includes("--dry-run");
const bucketName = process.env.PHOTO_BUCKET;
if (!bucketName) throw new Error("Set PHOTO_BUCKET");

const db = new PrismaClient();
const bucket = new Storage().bucket(bucketName);

const rows = await db.listingImage.findMany({ where: { url: { startsWith: "data:" } }, select: { id: true, listingId: true }, orderBy: { createdAt: "asc" } });
console.log(`${rows.length} photos still in the database${dry ? " (dry run)" : ""}`);
let moved = 0;
let bytes = 0;
for (const { id, listingId } of rows) {
  const row = await db.listingImage.findUnique({ where: { id }, select: { url: true } });
  if (!row?.url.startsWith("data:")) continue;
  if (dry) { bytes += row.url.length; moved++; continue; }
  const { buffer, contentType } = dataUrlToBuffer(row.url);
  const name = `listings/${listingId}/${randomUUID()}.jpg`;
  await bucket.file(name).save(buffer, { contentType, resumable: false });
  const [exists] = await bucket.file(name).exists();
  if (!exists) throw new Error(`Upload of ${id} not found afterwards, stopping`);
  await db.listingImage.update({ where: { id }, data: { url: `gcs:${name}` } });
  bytes += buffer.length;
  moved++;
  if (moved % 25 === 0) console.log(`${moved}/${rows.length}`);
}
console.log(`${dry ? "Would move" : "Moved"} ${moved} photos, ${(bytes / 1048576).toFixed(1)} MB`);
await db.$disconnect();
