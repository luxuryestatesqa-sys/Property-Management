// Resizes an image file client-side (longer side capped at maxDimension) and
// re-encodes it as a compressed JPEG data URL, so avatar uploads stay small
// without needing a separate file-storage service. minDimension rejects a
// source whose longer side falls short of it - this only ever shrinks an
// image, so a low-resolution source (a screenshot, a cropped thumbnail)
// would otherwise pass through close to its original, often-tiny size.
// Property Finder's own image spec requires at least 5KB per photo and
// rejects anything smaller as a processing failure; a real property photo at
// a sensible resolution is never naturally that small, so this catches it at
// upload time with a clear reason instead of a portal rejecting it later.
export function resizeImageFile(file: File, maxDimension = 320, quality = 0.82, minDimension = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        if (minDimension > 0 && Math.max(img.width, img.height) < minDimension) {
          reject(new Error(`Photo resolution is too low (${img.width}×${img.height}px) - use a photo at least ${minDimension}px on its longest side`));
          return;
        }
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height >= width && height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Listing photos are shown larger than avatars (full-width cards, gallery),
// so they get more headroom than the 320px/0.82 avatar preset. The 640px
// floor is well above a typical screenshot/thumbnail but comfortably below
// what any real phone or camera photo shoots at.
export function resizeListingPhoto(file: File): Promise<string> {
  return resizeImageFile(file, 1280, 0.75, 640);
}

// Document photos (title deed, authorization form) need enough resolution
// that printed text stays legible when zoomed in, so this gets more headroom
// than a regular listing photo.
export function resizeDocumentPhoto(file: File): Promise<string> {
  return resizeImageFile(file, 1600, 0.82);
}

// Server-safe (no `document`/`canvas`) decode of a stored data URL back into
// raw bytes, for routes that need to serve a listing photo as a real image
// response instead of embedding it as base64 in JSON.
export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Not a base64 data URL");
  const [, contentType, base64] = match;
  return { buffer: Buffer.from(base64, "base64"), contentType };
}
