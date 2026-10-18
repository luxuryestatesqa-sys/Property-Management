"use client";

import { useEffect, useState } from "react";
import DocumentPicker from "./DocumentPicker";

export interface PrivateDetailsValue {
  ownerName: string;
  ownerPhone: string;
  ownerWhatsapp: string;
  titleDeedNumber: string;
  privateNotes: string;
  titleDeedImage: string | null;
  authorizationFormImage: string | null;
  ownerId: string; // "" = no owner record
  leaseEndDate: string; // yyyy-mm-dd, rentals only
}

export const EMPTY_PRIVATE_DETAILS: PrivateDetailsValue = {
  ownerId: "",
  leaseEndDate: "",
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

  type OwnerRow = { id: string; name: string; phone: string | null; whatsapp: string | null };
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [newOwner, setNewOwner] = useState({ name: "", phone: "" });
  const [ownerError, setOwnerError] = useState("");
  useEffect(() => {
    fetch("/api/owners")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOwners(d.owners))
      .catch(() => {});
  }, []);

  // Choosing an owner fills the owner contact fields below from their record.
  function pickOwner(id: string) {
    const o = owners.find((x) => x.id === id);
    onChange({ ...value, ownerId: id, ...(o ? { ownerName: o.name, ownerPhone: o.phone ?? "", ownerWhatsapp: o.whatsapp ?? "" } : {}) });
  }

  async function createOwner() {
    setOwnerError("");
    const res = await fetch("/api/owners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newOwner.name, phone: newOwner.phone, whatsapp: newOwner.phone }) });
    const d = await res.json().catch(() => null);
    if (!res.ok) return setOwnerError(typeof d?.error === "string" ? d.error : "Couldn't add the owner");
    setOwners((o) => [...o, d.owner].sort((a, b) => a.name.localeCompare(b.name)));
    setAdding(false);
    setNewOwner({ name: "", phone: "" });
    onChange({ ...value, ownerId: d.owner.id, ownerName: d.owner.name, ownerPhone: d.owner.phone ?? "", ownerWhatsapp: d.owner.whatsapp ?? "" });
  }

  return (
    <section className="@container rounded-2xl border border-border bg-surface p-4">
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
          <label className="text-sm font-medium text-foreground block mb-1.5">Owner record</label>
          <select value={value.ownerId} onChange={(e) => (e.target.value === "__new" ? setAdding(true) : pickOwner(e.target.value))} className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary">
            <option value="">No owner record</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value="__new">+ Add a new owner…</option>
          </select>
          {adding && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-surface-muted p-3">
              <input value={newOwner.name} onChange={(e) => setNewOwner((n) => ({ ...n, name: e.target.value }))} placeholder="Owner name" className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] outline-none" />
              <input value={newOwner.phone} onChange={(e) => setNewOwner((n) => ({ ...n, phone: e.target.value }))} placeholder="e.g. +974 5000 0000" className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] outline-none" />
              {ownerError && <p className="text-[12.5px] text-danger">{ownerError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(false)} className="rounded-lg bg-surface px-3 py-1.5 text-[13px] font-semibold">
                  Cancel
                </button>
                <button type="button" onClick={createOwner} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ background: "var(--primary)" }}>
                  Add owner
                </button>
              </div>
            </div>
          )}
        </div>
        {listingType === "RENT" && (
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Lease ends</label>
            <input type="date" value={value.leaseEndDate} onChange={(e) => update("leaseEndDate", e.target.value)} className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary" />
            <p className="mt-1 text-[12px] text-muted">You&apos;ll be reminded 60 and 30 days before it ends (on the dashboard and this listing).</p>
          </div>
        )}
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
        <div className="flex flex-col gap-3 @lg:flex-row">
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground block mb-1.5">Owner Phone</label>
            <input
              type="tel"
              value={value.ownerPhone}
              onChange={(e) => update("ownerPhone", e.target.value)}
              placeholder="e.g. +974 5000 0000"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground block mb-1.5">Owner WhatsApp</label>
            <input
              type="tel"
              value={value.ownerWhatsapp}
              onChange={(e) => update("ownerWhatsapp", e.target.value)}
              placeholder="e.g. +974 5000 0000"
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
