"use client";

import DocumentPicker from "./DocumentPicker";

export interface PrivateDetailsValue {
  ownerName: string;
  ownerPhone: string;
  ownerWhatsapp: string;
  titleDeedNumber: string;
  privateNotes: string;
  titleDeedImage: string | null;
  authorizationFormImage: string | null;
}

export const EMPTY_PRIVATE_DETAILS: PrivateDetailsValue = {
  ownerName: "",
  ownerPhone: "",
  ownerWhatsapp: "",
  titleDeedNumber: "",
  privateNotes: "",
  titleDeedImage: null,
  authorizationFormImage: null,
};

// Optional owner/title-deed reference fields shown when adding or editing a
// listing. Kept as one component so the "only visible to you" framing and
// the field set stay identical between the add form and the edit form.
//
// The document upload slot depends on listing type: a sale has a title deed,
// a rental has a landlord authorization form instead - never both.
export default function PrivateDetailsSection({
  value,
  onChange,
  listingType,
}: {
  value: PrivateDetailsValue;
  onChange: (value: PrivateDetailsValue) => void;
  listingType: "RENT" | "SALE";
}) {
  function update<K extends keyof PrivateDetailsValue>(key: K, v: PrivateDetailsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 mb-0.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Private Details</h3>
      </div>
      <p className="text-[12px] text-muted mb-3">Optional. Only visible to you and admins — never shown to other agents.</p>

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Owner Name</label>
          <input
            type="text"
            value={value.ownerName}
            onChange={(e) => update("ownerName", e.target.value)}
            placeholder="e.g. Mohammed Al-Thani"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground block mb-1.5">Owner Phone</label>
            <input
              type="tel"
              value={value.ownerPhone}
              onChange={(e) => update("ownerPhone", e.target.value)}
              placeholder="+974 5000 0000"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground block mb-1.5">Owner WhatsApp</label>
            <input
              type="tel"
              value={value.ownerWhatsapp}
              onChange={(e) => update("ownerWhatsapp", e.target.value)}
              placeholder="+974 5000 0000"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
            />
          </div>
        </div>

        {listingType === "SALE" ? (
          <>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Title Deed Number</label>
              <input
                type="text"
                value={value.titleDeedNumber}
                onChange={(e) => update("titleDeedNumber", e.target.value)}
                placeholder="e.g. TD-2024-11234"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
              />
            </div>
            <DocumentPicker
              label="Title Deed Photo"
              value={value.titleDeedImage}
              onChange={(v) => update("titleDeedImage", v)}
            />
          </>
        ) : (
          <DocumentPicker
            label="Authorization Form"
            value={value.authorizationFormImage}
            onChange={(v) => update("authorizationFormImage", v)}
          />
        )}

        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Private Notes</label>
          <textarea
            value={value.privateNotes}
            onChange={(e) => update("privateNotes", e.target.value)}
            placeholder="Anything else only you should see"
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-primary resize-none"
          />
        </div>
      </div>
    </section>
  );
}
