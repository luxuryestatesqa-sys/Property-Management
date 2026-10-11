"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingImageDTO } from "@/lib/types";
import { IconChevronLeft, IconChevronRight, IconClose, IconGrid, IconImage } from "./icons";

// Desktop photo area: an editorial mosaic (one large photo plus up to four
// smaller ones, adapting to however many photos there are) and a full-screen
// lightbox with arrows and keyboard navigation.
export default function PhotoGalleryDesktop({ images, height = 440 }: { images: ListingImageDTO[]; height?: number }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const count = images.length;

  const go = useCallback((delta: number) => setLightbox((i) => (i === null || !count ? i : (i + delta + count) % count)), [count]);

  useEffect(() => {
    if (lightbox === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox, go]);

  if (count === 0) {
    return (
      <div className="flex w-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted text-muted" style={{ height }}>
        <div className="flex flex-col items-center gap-2 text-[14px]">
          <IconImage size={32} />
          No photos yet
        </div>
      </div>
    );
  }

  const shown = images.slice(0, 5);
  const extra = count - shown.length;

  // grid recipe by photo count
  const layout =
    shown.length === 1
      ? { cols: "grid-cols-1", cell: ["col-span-1 row-span-2"] }
      : shown.length === 2
        ? { cols: "grid-cols-2", cell: ["row-span-2", "row-span-2"] }
        : shown.length === 3
          ? { cols: "grid-cols-3", cell: ["col-span-2 row-span-2", "", ""] }
          : shown.length === 4
            ? { cols: "grid-cols-3", cell: ["col-span-2 row-span-2", "", ""] }
            : { cols: "grid-cols-4", cell: ["col-span-2 row-span-2", "", "", "", ""] };
  const visible = shown.length === 4 ? shown.slice(0, 3) : shown;

  return (
    <>
      <div className="relative">
        <div className={`grid grid-rows-2 gap-2.5 overflow-hidden rounded-2xl ${layout.cols}`} style={{ height }}>
          {visible.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setLightbox(i)}
              aria-label={`Open photo ${i + 1}`}
              className={`group relative min-h-0 overflow-hidden bg-surface-muted ${layout.cell[i]}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={i === 0 ? "Property photo" : ""}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLightbox(0)}
          className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-[13px] font-semibold text-slate-900 shadow-lg backdrop-blur transition hover:bg-white"
        >
          <IconGrid size={15} />
          {extra > 0 || count > 1 ? `View all ${count} photos` : "View photo"}
        </button>
      </div>

      {lightbox !== null && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Photo viewer">
          <button type="button" aria-label="Close" onClick={() => setLightbox(null)} className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <IconClose size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[lightbox].url} alt="" className="max-h-[86vh] max-w-[88vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          {count > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                className="absolute left-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <IconChevronLeft size={22} />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                className="absolute right-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <IconChevronRight size={22} />
              </button>
              <div className="absolute bottom-6 rounded-full bg-white/10 px-4 py-1.5 text-[13px] text-white">
                {lightbox + 1} / {count}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
