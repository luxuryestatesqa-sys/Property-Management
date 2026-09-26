"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PublicListingDTO, PublicAgentDTO } from "@/lib/types";
import { formatQAR, formatSqm } from "@/lib/format";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitLabelFor } from "@/lib/propertyCategory";
import WhatsAppButton from "@/components/WhatsAppButton";
import CallButton from "@/components/CallButton";
import PhotoGallery from "@/components/PhotoGallery";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = agentId ? `?agent=${encodeURIComponent(agentId)}` : "";
    const res = await fetch(`/api/public/listings/${id}${qs}`);
    if (res.ok) {
      const data = await res.json();
      setListing(data.listing);
      setAgent(data.agent);
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
    "Hi, I'm interested in this listing on Luxury Estates:",
    "",
    `${listing.buildingName}, ${listing.community}, ${listing.area}`,
    "",
    "Is this still available?",
  ].join("\n");

  return (
    <div className="px-4 pb-10">
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center gap-3">
        <h1 className="text-lg font-bold truncate flex-1">{listing.buildingName}</h1>
      </div>

      <div className="flex flex-col gap-4">
        <PhotoGallery images={listing.images} />

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

          <div className="text-[26px] font-extrabold text-foreground mt-2.5 leading-tight">
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
            {listing.buildingName} · {unitLabelFor(listing.propertyCategory).unitShortLabel} {listing.apartmentNumber}
            {unitLabelFor(listing.propertyCategory).showFloor && `, Floor ${listing.floor}`}
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

        {agent && (
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
        )}
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
