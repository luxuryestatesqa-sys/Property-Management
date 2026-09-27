"use client";

import { useState } from "react";
import { ListingDTO } from "@/lib/types";
import { formatQAR } from "@/lib/format";
import { BEDROOM_LABELS } from "@/lib/propertyCategory";
import { AMENITY_LABELS } from "@/lib/propertyFinder/mapping";

interface PropertyFinderPreviewSheetProps {
  open: boolean;
  onClose: () => void;
  listing: ListingDTO;
  title: string;
  description: string;
  lang: "en" | "ar";
  reference: string;
  bathrooms: string | null;
  amenities: string[];
  locationLabel: string | null;
  categoryTypeLabel: string;
  agentName: string | null;
}

// A best-effort mockup of how this listing will read once live on Property
// Finder, built from exactly the fields buildListingPayload() sends - not a
// pixel-exact copy of PF's own page (we don't have their live template),
// but enough for an agent to catch a wrong price, missing photo, or typo
// before spending a publish credit on it.
export default function PropertyFinderPreviewSheet({
  open,
  onClose,
  listing,
  title,
  description,
  lang,
  reference,
  bathrooms,
  amenities,
  locationLabel,
  categoryTypeLabel,
  agentName,
}: PropertyFinderPreviewSheetProps) {
  const [activePhoto, setActivePhoto] = useState(0);

  if (!open) return null;

  const isRent = listing.listingType === "RENT";
  const price = isRent ? listing.rentPrice : listing.salePrice;
  const isRtl = lang === "ar";
  const photos = listing.images;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-t-3xl max-h-[92vh] flex flex-col mx-auto w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Preview</h2>
            <p className="text-[11px] text-muted">Approximate - actual Property Finder styling may differ</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview" className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-muted text-muted shrink-0">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto no-scrollbar">
          <div className="relative aspect-[4/3] bg-surface-muted">
            {photos.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos[activePhoto].url} alt={title || listing.buildingName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl text-border">🏠</div>
            )}
            {photos.length > 1 && (
              <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1.5">
                {photos.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActivePhoto(i)}
                    aria-label={`Photo ${i + 1}`}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: i === activePhoto ? "#fff" : "rgba(255,255,255,0.5)" }}
                  />
                ))}
              </div>
            )}
            {photos.length > 1 && (
              <span className="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
                {activePhoto + 1}/{photos.length}
              </span>
            )}
          </div>

          <div className="px-5 py-4 flex flex-col gap-3" dir={isRtl ? "rtl" : "ltr"}>
            <div>
              <div className="text-[22px] font-extrabold text-foreground leading-tight">
                {price ? `${formatQAR(price)}${isRent ? "/month" : ""}` : "Price not set"}
              </div>
              <div className="text-[15px] font-semibold text-foreground mt-1">{title || "(No title set)"}</div>
            </div>

            <div className="flex items-start gap-1.5 text-[13px] text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              <span>{locationLabel ?? `${listing.area} → ${listing.community}`}</span>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted border-y border-border py-2.5">
              <span>{categoryTypeLabel}</span>
              {listing.bedrooms && <span>{BEDROOM_LABELS[listing.bedrooms]}</span>}
              {bathrooms && <span>{bathrooms} Bath</span>}
              {listing.sizeSqm && <span>{listing.sizeSqm} sqm</span>}
            </div>

            <div>
              <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-1">Description</h3>
              <p className="text-[14px] text-foreground whitespace-pre-wrap">{description || "(No description set)"}</p>
            </div>

            {amenities.length > 0 && (
              <div>
                <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-1.5">Amenities</h3>
                <div className="flex flex-wrap gap-1.5">
                  {amenities.map((a) => (
                    <span key={a} className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-surface-muted text-foreground">
                      {AMENITY_LABELS[a] ?? a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[12px] text-muted pt-2 border-t border-border" dir="ltr">
              <span>Ref: {reference}</span>
              {agentName && <span>Listed by {agentName}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
