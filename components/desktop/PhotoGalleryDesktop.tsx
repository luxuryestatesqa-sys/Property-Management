"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingImageDTO } from "@/lib/types";
import { IconChevronLeft, IconChevronRight, IconClose, IconExpand, IconImage } from "./icons";

// Desktop photo viewer: a large hero image with prev/next arrows, a clickable
// thumbnail strip, keyboard arrows, and a full-screen lightbox.
export default function PhotoGalleryDesktop({ images }: { images: ListingImageDTO[] }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const count = images.length;

  const go = useCallback((delta: number) => setActive((i) => (count ? (i + delta + count) % count : 0)), [count]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") setLightbox(false);
    }
    if (!lightbox) return;
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox, go]);

  if (count === 0) {
    return (
      <div className="flex aspect-[16/10] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted text-muted">
        <div className="flex flex-col items-center gap-2 text-[14px]">
          <IconImage size={32} />
          No photos yet
        </div>
      </div>
    );
  }

  const arrow = "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition hover:scale-105 hover:bg-white";

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative aspect-[16/10] overflow-hidden rounded-2xl bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[active].url} alt={`Property photo ${active + 1}`} className="h-full w-full cursor-zoom-in object-cover" onClick={() => setLightbox(true)} />
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className={`${arrow} left-4 opacity-0 group-hover:opacity-100`}>
              <IconChevronLeft size={20} />
            </button>
            <button type="button" aria-label="Next photo" onClick={() => go(1)} className={`${arrow} right-4 opacity-0 group-hover:opacity-100`}>
              <IconChevronRight size={20} />
            </button>
          </>
        )}
        <div className="absolute bottom-4 left-4 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm">
          {active + 1} / {count}
        </div>
        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label="View full screen"
          className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
        >
          <IconExpand size={16} />
        </button>
      </div>

      {count > 1 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View photo ${i + 1}`}
              className="relative h-[72px] w-[104px] shrink-0 overflow-hidden rounded-lg transition"
              style={{ boxShadow: i === active ? "0 0 0 2px var(--primary)" : "0 0 0 1px var(--border)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-opacity" style={{ opacity: i === active ? 1 : 0.65 }} />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90" onClick={() => setLightbox(false)} role="dialog" aria-modal="true" aria-label="Photo viewer">
          <button type="button" aria-label="Close" onClick={() => setLightbox(false)} className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <IconClose size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[active].url} alt="" className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
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
                {active + 1} / {count}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
