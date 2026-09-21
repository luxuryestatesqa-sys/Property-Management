"use client";

import { useRef, useState } from "react";
import { resizeListingPhoto } from "@/lib/image";
import { MAX_LISTING_IMAGES } from "@/lib/constants";

interface PhotoPickerProps {
  images: string[]; // data URLs; index 0 is the cover photo shown on cards
  onChange: (images: string[]) => void;
}

const DRAG_THRESHOLD_PX = 6;

export default function PhotoPicker({ images, onChange }: PhotoPickerProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number; index: number } | null>(null);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setError("");
    const remaining = MAX_LISTING_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`Up to ${MAX_LISTING_IMAGES} photos allowed`);
      return;
    }
    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(`Only added ${remaining} photo${remaining === 1 ? "" : "s"} — up to ${MAX_LISTING_IMAGES} allowed`);
    }

    setProcessing(true);
    try {
      const resized: string[] = [];
      for (const file of toProcess) {
        if (!file.type.startsWith("image/")) continue;
        resized.push(await resizeListingPhoto(file));
      }
      onChange([...images, ...resized]);
    } catch {
      setError("Failed to process one or more photos");
    } finally {
      setProcessing(false);
    }
  }

  function removeAt(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, index: number) {
    if (processing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStartRef.current = { x: e.clientX, y: e.clientY, index };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;
    if (!start) return;

    if (dragIndex === null) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      setDragIndex(start.index);
      return;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const tile = target?.closest("[data-photo-index]") as HTMLElement | null;
    if (!tile) return;
    const overIndex = Number(tile.dataset.photoIndex);
    if (Number.isNaN(overIndex) || overIndex === dragIndex) return;

    const next = [...images];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved);
    onChange(next);
    setDragIndex(overIndex);
    pointerStartRef.current = { ...start, index: overIndex };
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    pointerStartRef.current = null;
    setDragIndex(null);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {images.map((src, index) => (
          <div
            key={src}
            data-photo-index={index}
            onPointerDown={(e) => handlePointerDown(e, index)}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative aspect-square rounded-xl overflow-hidden border bg-surface-muted select-none"
            style={{
              touchAction: "none",
              borderColor: dragIndex === index ? "var(--primary)" : "var(--border)",
              opacity: dragIndex === index ? 0.6 : 1,
              transform: dragIndex === index ? "scale(0.96)" : "scale(1)",
              transition: dragIndex === null ? "transform 120ms, opacity 120ms" : "none",
              zIndex: dragIndex === index ? 10 : 1,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Property photo ${index + 1}`} draggable={false} className="w-full h-full object-cover pointer-events-none" />
            {index === 0 && (
              <span className="pointer-events-none absolute bottom-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white">
                Cover
              </span>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => removeAt(index)}
              aria-label={`Remove photo ${index + 1}`}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-[12px] active:opacity-70"
            >
              ✕
            </button>
          </div>
        ))}

        {images.length < MAX_LISTING_IMAGES && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
            aria-label="Add photos"
            className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted active:bg-surface-muted disabled:opacity-60"
          >
            {processing ? (
              <span className="w-5 h-5 rounded-full border-2 border-muted border-t-transparent animate-spin" />
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                <span className="text-[11px] font-medium">Add</span>
              </>
            )}
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFilesSelected} className="hidden" />

      {error && <p className="text-[12px] text-danger mt-2">{error}</p>}
      {images.length > 1 && <p className="text-[11px] text-muted mt-2">Drag a photo to reorder — the first one is the cover.</p>}
    </div>
  );
}
