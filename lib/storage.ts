import { randomUUID } from "node:crypto";
import { dataUrlToBuffer } from "@/lib/image";

// Listing photos live in a private Cloud Storage bucket (PHOTO_BUCKET). ListingImage.url then holds a
// pointer, "gcs:<object name>", and the image route streams the bytes back. Rows that still hold a data
// URL keep working, and with no PHOTO_BUCKET set (local dev, tests) new photos stay data URLs as before.
const PREFIX = "gcs:";

export const isStoredInBucket = (url: string) => url.startsWith(PREFIX);

async function bucket() {
  const name = process.env.PHOTO_BUCKET;
  if (!name) return null;
  const { Storage } = await import("@google-cloud/storage");
  return new Storage().bucket(name);
}

// Uploads one photo and returns what to save in ListingImage.url. If the bucket is unset or the upload
// fails the data URL itself is returned, so an agent's upload is never lost.
export async function storeListingPhoto(listingId: number, dataUrl: string): Promise<string> {
  try {
    const b = await bucket();
    if (!b) return dataUrl;
    const { buffer, contentType } = dataUrlToBuffer(dataUrl);
    const name = `listings/${listingId}/${randomUUID()}.jpg`;
    await b.file(name).save(buffer, { contentType, resumable: false });
    return PREFIX + name;
  } catch (err) {
    console.error("Photo upload to bucket failed, keeping it in the database:", err);
    return dataUrl;
  }
}

export async function readStoredPhoto(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const b = await bucket();
  if (!b) throw new Error("PHOTO_BUCKET is not set");
  const file = b.file(url.slice(PREFIX.length));
  const [[buffer], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  return { buffer, contentType: meta.contentType ?? "image/jpeg" };
}
