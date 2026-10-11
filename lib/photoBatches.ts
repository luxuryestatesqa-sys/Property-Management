// Photos travel as data URLs inside JSON. A single request can't be bigger than about 4.5 MB on Vercel,
// so photos are sent in batches that stay well under that, never all in one message.
export const PHOTO_BATCH_CHARS = 3_000_000;

// Splits photos into batches of at most `max` characters (a photo bigger than that goes alone), keeping order.
export function splitPhotoBatches(urls: string[], max = PHOTO_BATCH_CHARS): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const url of urls) {
    if (current.length > 0 && size + url.length > max) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(url);
    size += url.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
