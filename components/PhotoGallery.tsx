"use client";

import { useEffect, useRef, useState } from "react";
import { ListingImageDTO } from "@/lib/types";

const THUMBS_VISIBLE = 4;
const THUMB_GAP_PX = 8;

export default function PhotoGallery({ images }: { images: ListingImageDTO[] }) {
  const [active, setActive] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);

  function updateThumbScrollState() {
    const el = thumbsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  // Recompute once the thumbnail strip has its real width (e.g. more than
  // THUMBS_VISIBLE photos means it overflows and the right arrow should show
  // immediately, without waiting for the user to scroll first).
  useEffect(() => {
    updateThumbScrollState();
  }, [images.length]);

  if (images.length === 0) return null;

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  function scrollToIndex(index: number) {
    const el = scrollerRef.current;
    if (!el) return;
    setActive(index);
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }

  function scrollThumbs(direction: 1 | -1) {
    const el = thumbsRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative -mx-4">
        <div className="aspect-[4/3]">
          <div ref={scrollerRef} onScroll={handleScroll} className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar h-full">
            {images.map((img, index) => (
              <div key={img.id} className="w-full shrink-0 snap-center px-4 h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt="Property photo"
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className="w-full h-full object-cover rounded-2xl"
                />
              </div>
            ))}
          </div>
        </div>
        {images.length > 1 && (
          <div className="absolute bottom-3 right-7 text-[11px] font-semibold px-2 py-1 rounded-full bg-black/60 text-white">
            {active + 1} / {images.length}
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="relative">
          <div
            ref={thumbsRef}
            onScroll={updateThumbScrollState}
            className="flex overflow-x-auto no-scrollbar"
            style={{ gap: THUMB_GAP_PX }}
          >
            {images.map((img, index) => (
              <button
                key={img.id}
                type="button"
                onClick={() => scrollToIndex(index)}
                aria-label={`View photo ${index + 1}`}
                className="relative shrink-0 aspect-square rounded-lg overflow-hidden active:opacity-80"
                style={{
                  width: `calc((100% - ${(THUMBS_VISIBLE - 1) * THUMB_GAP_PX}px) / ${THUMBS_VISIBLE})`,
                  boxShadow: index === active ? "0 0 0 2px var(--primary)" : "0 0 0 1px var(--border)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                  style={{ opacity: index === active ? 1 : 0.6 }}
                />
              </button>
            ))}
          </div>

          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollThumbs(-1)}
              aria-label="Show previous photos"
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/3 w-7 h-7 rounded-full bg-surface border border-border shadow-sm flex items-center justify-center active:opacity-70"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollThumbs(1)}
              aria-label="Show more photos"
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 w-7 h-7 rounded-full bg-surface border border-border shadow-sm flex items-center justify-center active:opacity-70"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
