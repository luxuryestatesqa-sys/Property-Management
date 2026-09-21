"use client";

import { useRef, useState } from "react";
import { ListingImageDTO } from "@/lib/types";

export default function PhotoGallery({ images }: { images: ListingImageDTO[] }) {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (images.length === 0) return null;

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActive(index);
  }

  return (
    <div className="relative -mx-4">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
      >
        {images.map((img) => (
          <div key={img.id} className="w-full shrink-0 snap-center px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="Property photo" className="w-full aspect-[4/3] object-cover rounded-2xl" />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-3 right-7 text-[11px] font-semibold px-2 py-1 rounded-full bg-black/60 text-white">
          {active + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
