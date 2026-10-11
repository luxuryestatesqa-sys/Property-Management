import { describe, it, expect } from "vitest";
import { MAX_LISTING_IMAGES } from "./constants";
import { PHOTO_BATCH_CHARS, splitPhotoBatches } from "./photoBatches";
import { listingCreateSchema, listingUpdateSchema } from "./validation";
import { listingImageUrl, withImageLinks } from "./listingImages";

const photo = (chars: number) => `data:image/jpeg;base64,${"A".repeat(chars)}`;

describe("photo limit", () => {
  it("is 25 photos per listing", () => {
    expect(MAX_LISTING_IMAGES).toBe(25);
  });

  it("a new listing accepts 25 photos and refuses 26 or none", () => {
    const base = { listingType: "RENT", propertyCategory: "APARTMENT", bedrooms: "TWO", sizeSqm: 100, area: "A", community: "B", buildingName: "C", floor: "1", apartmentNumber: "2", rentPrice: 5000, furnished: "FURNISHED" };
    const ok = (n: number) => listingCreateSchema.safeParse({ ...base, images: Array.from({ length: n }, () => photo(10)) });
    expect(ok(25).success).toBe(true);
    expect(ok(26).success).toBe(false);
    expect(ok(0).success).toBe(false);
  });

  it("an edit accepts new photos and {id} references together, up to 25, never none", () => {
    const refs = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? { id: `img${i}` } : photo(10)));
    expect(listingUpdateSchema.safeParse({ images: refs(25) }).success).toBe(true);
    expect(listingUpdateSchema.safeParse({ images: refs(26) }).success).toBe(false);
    expect(listingUpdateSchema.safeParse({ images: [] }).success).toBe(false);
    expect(listingUpdateSchema.safeParse({ images: [{ id: "" }] }).success).toBe(false);
    expect(listingUpdateSchema.safeParse({ images: ["not an image"] }).success).toBe(false);
  });
});

describe("splitPhotoBatches", () => {
  it("keeps every batch under the size and the photos in order", () => {
    const photos = Array.from({ length: 25 }, (_, i) => photo(400_000 + i)); // 25 photos of ~400 KB
    const batches = splitPhotoBatches(photos);
    expect(batches.flat()).toEqual(photos);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) expect(b.reduce((n, u) => n + u.length, 0)).toBeLessThanOrEqual(PHOTO_BATCH_CHARS);
  });

  it("one small batch when it all fits, none when there are no photos, and a huge photo goes alone", () => {
    expect(splitPhotoBatches([photo(100), photo(100)])).toHaveLength(1);
    expect(splitPhotoBatches([])).toEqual([]);
    const big = photo(PHOTO_BATCH_CHARS + 5);
    expect(splitPhotoBatches([photo(10), big, photo(10)])).toEqual([[photo(10)], [big], [photo(10)]]);
  });
});

describe("photo links", () => {
  it("point at the image route, with a version that changes when the photo does", () => {
    const img = { id: "abc", createdAt: new Date("2026-01-01T00:00:00Z") };
    expect(listingImageUrl(7, img)).toBe(`/api/listings/7/images/abc.jpg?v=${img.createdAt.getTime()}`);
    expect(withImageLinks(7, [img])).toEqual([{ id: "abc", url: listingImageUrl(7, img) }]);
  });
});
