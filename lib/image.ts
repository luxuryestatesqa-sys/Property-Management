// Resizes an image file client-side (longer side capped at maxDimension) and
// re-encodes it as a compressed JPEG data URL, so avatar uploads stay small
// without needing a separate file-storage service.
export function resizeImageFile(file: File, maxDimension = 320, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
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
// so they get more headroom than the 320px/0.82 avatar preset.
export function resizeListingPhoto(file: File): Promise<string> {
  return resizeImageFile(file, 1280, 0.75);
}

// Document photos (title deed, authorization form) need enough resolution
// that printed text stays legible when zoomed in, so this gets more headroom
// than a regular listing photo.
export function resizeDocumentPhoto(file: File): Promise<string> {
  return resizeImageFile(file, 1600, 0.82);
}
