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
  const bedroomCount = listing.bedrooms ? BEDROOM_LABELS[listing.bedrooms] : null;
  const initials = (agentName ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

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

            <span className="absolute top-2.5 left-2.5 text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#e0212c] text-white uppercase tracking-wide">
              {isRent ? "For Rent" : "For Sale"}
            </span>
            <span className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
            </span>

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
              <span className="absolute bottom-2.5 right-2.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
                {activePhoto + 1}/{photos.length}
              </span>
            )}
          </div>

          <div className="px-5 py-4 flex flex-col gap-4" dir={isRtl ? "rtl" : "ltr"}>
            <div>
              <div className="text-[24px] font-extrabold text-foreground leading-tight" dir="ltr">
                {price ? `${formatQAR(price)}${isRent ? " / month" : ""}` : "Price not set"}
              </div>
              <div className="text-[15px] font-semibold text-foreground mt-1.5">{title || "(No title set)"}</div>
              <div className="flex items-start gap-1.5 text-[13px] text-muted mt-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                <span>{locationLabel ?? `${listing.area} → ${listing.community}`}</span>
              </div>
            </div>

            <div className="flex items-stretch rounded-2xl bg-surface-muted py-3 px-2">
              <div className="flex-1 flex flex-col items-center gap-1 text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6" />
                  <path d="M3 18h18" />
                  <path d="M5 10V7a2 2 0 0 1 2-2h3v5" />
                  <path d="M12 10V5h3a2 2 0 0 1 2 2v3" />
                </svg>
                <span className="text-[13px] font-semibold">{bedroomCount ?? "-"}</span>
                <span className="text-[10px] text-muted uppercase tracking-wide">Beds</span>
              </div>
              <div className="w-px bg-border" />
              <div className="flex-1 flex flex-col items-center gap-1 text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3Z" />
                  <path d="M6 12V6a2 2 0 0 1 3.5-1.3" />
                  <path d="M4 19v1" />
                  <path d="M20 19v1" />
                </svg>
                <span className="text-[13px] font-semibold">{bathrooms ?? "-"}</span>
                <span className="text-[10px] text-muted uppercase tracking-wide">Baths</span>
              </div>
              <div className="w-px bg-border" />
              <div className="flex-1 flex flex-col items-center gap-1 text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h4M3 15h4M17 3v4M17 17v4" />
                </svg>
                <span className="text-[13px] font-semibold">{listing.sizeSqm ?? "-"}</span>
                <span className="text-[10px] text-muted uppercase tracking-wide">sqm</span>
              </div>
              <div className="w-px bg-border" />
              <div className="flex-1 flex flex-col items-center gap-1 text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21V8l9-5 9 5v13" />
                  <path d="M9 21v-7h6v7" />
                </svg>
                <span className="text-[13px] font-semibold text-center leading-tight">{categoryTypeLabel}</span>
              </div>
            </div>

            {agentName && (
              <div className="flex items-center gap-3 rounded-2xl border border-border px-3.5 py-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0" style={{ background: "var(--primary)" }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-foreground truncate">{agentName}</div>
                  <div className="text-[11px] text-muted">Listed by</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-muted text-foreground">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2.1Z" />
                    </svg>
                  </span>
                  <span className="w-8 h-8 flex items-center justify-center rounded-full text-white" style={{ background: "#25D366" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.6.1s-.6.8-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.5c.1-.1.2-.3.2-.4.1-.1.1-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2s.9 2.6 1.1 2.7c.1.2 1.8 2.8 4.5 3.9.6.3 1.1.4 1.5.6.6.2 1.2.1 1.6.1.5-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.2-.3-.2-.5-.3Z" />
                    </svg>
                  </span>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-1">Description</h3>
              <p className="text-[14px] text-foreground whitespace-pre-wrap">{description || "(No description set)"}</p>
            </div>

            {amenities.length > 0 && (
              <div>
                <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-1.5">Amenities</h3>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {amenities.map((a) => (
                    <div key={a} className="flex items-center gap-2 text-[13px] text-foreground">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <circle cx="12" cy="12" r="9" />
                        <path d="m8.5 12 2.5 2.5 4.5-4.5" />
                      </svg>
                      <span>{AMENITY_LABELS[a] ?? a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[12px] text-muted pt-2 border-t border-border" dir="ltr">
              <span>Reference: {reference}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
