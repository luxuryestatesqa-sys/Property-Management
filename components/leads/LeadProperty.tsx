"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useOrg } from "@/components/OrgProvider";
import { buildLeadListingMessage } from "@/lib/whatsapp";
import { buildListingShareUrl } from "@/lib/shareLink";
import type { ListingDTO } from "@/lib/types";

export interface LeadPropertyListing {
  id: number;
  buildingName: string;
  area: string;
  community: string;
  listingType: "RENT" | "SALE";
  rentPrice: number | null;
  salePrice: number | null;
  propertyCategory: ListingDTO["propertyCategory"];
  bedrooms: ListingDTO["bedrooms"];
  sizeSqm: number | null;
  shareToken?: string | null;
  unitDetailsPrivate?: boolean;
  apartmentNumber?: string;
  floor?: string;
}

// Link a lead to the property it asked about ("Interested in LST-000085") and send that listing to them on
// WhatsApp with its price and public link (never the unit number when the listing hides it).
export default function LeadProperty({ leadId, leadName, phone, listing, onChange }: { leadId: string; leadName: string; phone: string | null; listing: LeadPropertyListing | null; onChange: () => void | Promise<void> }) {
  const { data: session } = useSession();
  const org = useOrg();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function link(value: string | null) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/leads/${leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing: value }) });
    if (!res.ok) {
      setBusy(false);
      return setError((await res.json().catch(() => null))?.error ?? "Couldn't link that property");
    }
    // Keep the box (and the busy state) until the lead has reloaded, so it never looks like nothing happened.
    await onChange();
    setBusy(false);
    setCode("");
  }

  const digits = phone?.replace(/[^\d]/g, "");
  const waHref =
    listing && digits && session?.user?.id
      ? `https://wa.me/${digits}?text=${encodeURIComponent(
          buildLeadListingMessage(
            { name: leadName },
            { ...listing, unitDetailsPrivate: Boolean(listing.unitDetailsPrivate), apartmentNumber: listing.apartmentNumber ?? "", floor: listing.floor ?? "" },
            buildListingShareUrl(listing, session.user.id),
            org.name
          )
        )}`
      : null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-[15px] font-medium">Interested property</h2>
      {listing ? (
        <div className="flex flex-wrap items-center gap-2">
          {waHref ? (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
              Send listing on WhatsApp
            </a>
          ) : (
            <span className="text-[13px] text-muted">{digits ? "Loading…" : "Add a phone number to send this on WhatsApp"}</span>
          )}
          <button type="button" disabled={busy} onClick={() => link(null)} className="rounded-xl bg-surface-muted px-4 py-2.5 text-[13.5px] font-semibold hover:bg-border disabled:opacity-60">
            Unlink
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) link(code.trim());
          }}
          className="flex gap-2"
        >
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. LST-000085" className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none" />
          <button type="submit" disabled={busy || !code.trim()} className="rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
            Link
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
