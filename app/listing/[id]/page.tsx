"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PublicListingDTO, PublicAgentDTO } from "@/lib/types";
import { formatQAR, formatSqm } from "@/lib/format";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS } from "@/lib/propertyCategory";
import { AMENITY_LABELS } from "@/lib/propertyFinder/mapping";
import WhatsAppButton from "@/components/WhatsAppButton";
import CallButton from "@/components/CallButton";
import PhotoGallery from "@/components/PhotoGallery";
import PhotoGalleryDesktop from "@/components/desktop/PhotoGalleryDesktop";
import { useIsDesktop } from "@/lib/useIsDesktop";
import PropertyDetailSkeleton from "@/components/PropertyDetailSkeleton";

// Public, unauthenticated listing view for share links - shows the same
// property details an agent sees, but never the listing's own creator. The
// only contact shown is the agent named by `?agent=` (whoever shared the
// link), so a client can't bypass the sharing agent. See
// app/api/public/listings/[id] and lib/shareLink.ts.
function PublicListingView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const agentId = searchParams.get("agent");

  const [listing, setListing] = useState<PublicListingDTO | null>(null);
  const [agent, setAgent] = useState<PublicAgentDTO | null>(null);
  const [org, setOrg] = useState<{ name: string; logoUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const isDesktop = useIsDesktop();

  const load = useCallback(async () => {
    setLoading(true);
    const qs = agentId ? `?agent=${encodeURIComponent(agentId)}` : "";
    const res = await fetch(`/api/public/listings/${id}${qs}`);
    if (res.ok) {
      const data = await res.json();
      setListing(data.listing);
      setAgent(data.agent);
      setOrg(data.org ?? null);
    }
    setLoading(false);
  }, [id, agentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <PropertyDetailSkeleton />;
  }

  if (!listing) {
    return (
      <div className="px-4 py-16 text-center text-muted">
        <p>This listing isn&apos;t available.</p>
      </div>
    );
  }

  const isRent = listing.listingType === "RENT";
  const inquiryMessage = [
    `Hi, I'm interested in this listing on ${org?.name ?? "your website"}:`,
    "",
    `${listing.buildingName}, ${listing.community}, ${listing.area}`,
    "",
    "Is this still available?",
  ].join("\n");

  return (
    <div className="px-4 pb-10 lg:max-w-6xl lg:mx-auto lg:px-8 lg:pb-20">
      <div className="hidden items-center justify-between border-b border-border py-5 lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={org?.logoUrl ?? "/logo.png"} alt={org?.name ?? ""} className="h-14 w-auto" />
        <span className="text-[13px] text-muted">Property details</span>
      </div>
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center gap-3 lg:static lg:pt-9 lg:pb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate lg:text-[34px] lg:leading-tight lg:tracking-tight">{listing.buildingName}</h1>
          <p className="hidden text-[15px] text-muted lg:block lg:mt-1">
            {listing.area} → {listing.community}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <div className="lg:sticky lg:top-6">
          {isDesktop ? <PhotoGalleryDesktop images={listing.images} /> : <PhotoGallery images={listing.images} />}
        </div>
        <div className="flex flex-col gap-4">

        <div className="rounded-2xl border border-border bg-surface shadow-sm p-4">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{
                background: isRent ? "var(--rent-bg)" : "var(--sale-bg)",
                color: isRent ? "var(--rent-text)" : "var(--sale-text)",
              }}
            >
              {isRent ? "FOR RENT" : "FOR SALE"}
            </span>
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: AVAILABILITY_COLORS[listing.availabilityStatus].bg, color: AVAILABILITY_COLORS[listing.availabilityStatus].text }}
            >
              {AVAILABILITY_LABELS[listing.availabilityStatus]}
            </span>
          </div>

          <div className="text-[26px] font-extrabold text-foreground mt-2.5 leading-tight lg:text-[36px] lg:tracking-tight">
            {isRent ? `${formatQAR(listing.rentPrice)}/month` : formatQAR(listing.salePrice)}
          </div>
          {!isRent && listing.rentalValue && (
            <div className="text-[13px] text-muted mt-0.5">Rental Value: {formatQAR(listing.rentalValue)}/month</div>
          )}

          <div className="flex items-start gap-1.5 mt-3 text-[13px] text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span>
              {listing.area} → {listing.community}
            </span>
          </div>
          <div className="text-[15px] font-semibold text-foreground mt-1">
            {listing.buildingName}
          </div>

          <div className="h-px bg-border my-3" />

          <div className="text-[13px] text-muted">
            {[
              PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
              listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
              listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
            ]
              .filter(Boolean)
              .join("  •  ")}
          </div>
          {listing.propertyCategory !== "LAND" && (
            <div className="text-[13px] text-muted mt-1">
              {[
                listing.furnished === "FURNISHED" ? "Furnished" : "Unfurnished",
                isRent && listing.billsStatus ? `Bills ${listing.billsStatus === "INCLUDED" ? "Included" : "Excluded"}` : null,
              ]
                .filter(Boolean)
                .join("  •  ")}
            </div>
          )}
        </div>

        {(listing.title || listing.description || listing.amenities.length > 0) && (
          <div className="rounded-2xl border border-border bg-surface shadow-sm p-4 flex flex-col gap-3">
            {listing.title && <h2 className="text-[17px] font-bold text-foreground leading-snug">{listing.title}</h2>}
            {listing.description && (
              <p className="text-[14px] text-foreground whitespace-pre-line leading-relaxed">{listing.description}</p>
            )}
            {listing.amenities.length > 0 && (
              <div>
                <div className="text-[13px] font-semibold text-foreground mb-1.5">Amenities</div>
                <div className="flex flex-wrap gap-1.5">
                  {listing.amenities.map((a) => (
                    <span key={a} className="text-[12px] px-2.5 py-1 rounded-full bg-surface-muted text-foreground">
                      {AMENITY_LABELS[a] ?? a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {agent && (
          <div className="flex flex-col gap-2.5 lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:p-5 lg:shadow-sm">
            <div className="hidden lg:block">
              <div className="text-[12.5px] text-muted">Your agent</div>
              <div className="text-[17px] font-semibold">{agent.name}</div>
            </div>
            <div className="flex gap-2.5">
            <WhatsAppButton
              number={agent.whatsapp}
              message={inquiryMessage}
              label="WhatsApp Now"
              variant="full"
              className="flex-1 justify-center py-3 text-[14px]"
            />
            <CallButton number={agent.whatsapp} label="Call Now" variant="full" className="flex-1 justify-center py-3 text-[14px]" />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default function PublicListingPage() {
  return (
    <Suspense fallback={<PropertyDetailSkeleton />}>
      <PublicListingView />
    </Suspense>
  );
}
