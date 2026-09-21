"use client";

import { ListingDTO } from "@/lib/types";
import { formatQAR, formatDate } from "@/lib/format";
import WhatsAppButton from "./WhatsAppButton";
import Avatar from "./Avatar";
import { buildListingInquiryMessage } from "@/lib/whatsapp";

interface DuplicateWarningModalProps {
  existing: ListingDTO[];
  onCancel: () => void;
  onContinue: () => void;
  submitting?: boolean;
}

export default function DuplicateWarningModal({ existing, onCancel, onContinue, submitting }: DuplicateWarningModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-background rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-3xl">⚠️</span>
            <div>
              <h2 className="text-lg font-bold text-foreground">Possible Duplicate</h2>
              <p className="text-sm text-muted mt-0.5">This property already exists in the system.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 mb-5">
            {existing.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  {l.images[0] && (
                    <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.images[0].url} alt={l.buildingName} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-[15px]">{l.buildingName}</div>
                    <div className="text-[13px] text-muted mt-0.5">
                      📍 {l.area} → {l.community}
                    </div>
                    <div className="text-[13px] text-muted mt-0.5">
                      Floor: {l.floor} &nbsp;·&nbsp; Apartment: {l.apartmentNumber}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2.5">
                  <span
                    className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                    style={{
                      background: l.listingType === "RENT" ? "var(--rent-bg)" : "var(--sale-bg)",
                      color: l.listingType === "RENT" ? "var(--rent-text)" : "var(--sale-text)",
                    }}
                  >
                    {l.listingType === "RENT" ? "FOR RENT" : "FOR SALE"}
                  </span>
                  <span className="font-bold text-[15px]">
                    {l.listingType === "RENT" ? `${formatQAR(l.rentPrice)}/mo` : formatQAR(l.salePrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <Avatar name={l.createdBy.name} avatarUrl={l.createdBy.avatarUrl} size={26} />
                    <div className="text-[12px] text-muted min-w-0 truncate">
                      Added by <span className="font-medium text-foreground">{l.createdBy.name}</span> · {formatDate(l.createdAt)}
                    </div>
                  </div>
                  <WhatsAppButton number={l.createdBy.whatsapp} message={buildListingInquiryMessage(l)} variant="full" />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[13px] text-muted mb-4">
            Different agents may legitimately have this property from different owners or agreements. You can still add
            your own separate listing.
          </p>

          <div className="flex gap-3 safe-bottom">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl py-3.5 text-base font-semibold text-foreground bg-surface-muted active:opacity-70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={submitting}
              className="flex-1 rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60"
              style={{ background: "var(--primary)" }}
            >
              {submitting ? "Adding..." : "Continue Anyway"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
