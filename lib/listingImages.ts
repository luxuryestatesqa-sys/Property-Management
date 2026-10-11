// Listings send each photo as a link to the image route (which serves it as a real, cacheable image)
// instead of embedding the photo in the JSON. With up to 25 photos the embedded form would be bigger
// than one response may be.
export function listingImageUrl(listingId: number, img: { id: string; createdAt: Date }): string {
  return `/api/listings/${listingId}/images/${img.id}.jpg?v=${img.createdAt.getTime()}`;
}

export function withImageLinks<T extends { id: string; createdAt: Date }>(listingId: number, images: T[]): { id: string; url: string }[] {
  return images.map((img) => ({ id: img.id, url: listingImageUrl(listingId, img) }));
}
