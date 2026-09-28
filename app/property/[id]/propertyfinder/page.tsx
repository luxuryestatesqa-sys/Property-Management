"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ListingDTO } from "@/lib/types";
import { BEDROOM_LABELS } from "@/lib/propertyCategory";
import { pfCategoryAndType, PF_FURNISHING_TYPE, filterAmenitiesForCategory, amenityOptionsFor } from "@/lib/propertyFinder/mapping";
import { extractErrorMessage } from "@/lib/errors";
import { formatQAR } from "@/lib/format";
import MultiChipSelect from "@/components/MultiChipSelect";
import PropertyFinderLocationPicker from "@/components/PropertyFinderLocationPicker";
import PropertyDetailSkeleton from "@/components/PropertyDetailSkeleton";
import SearchableSelect from "@/components/SearchableSelect";
import SegmentedControl from "@/components/SegmentedControl";
import PropertyFinderPreviewSheet from "@/components/PropertyFinderPreviewSheet";

interface PFUserOption {
  publicProfileId: number;
  name: string;
  email: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-border last:border-b-0 text-[14px]">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}

const STATE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  pending_publishing: { label: "Publishing…", bg: "var(--accent-light)", text: "var(--primary)" },
  live: { label: "Live", bg: "var(--success-bg)", text: "var(--success)" },
  publishing_failed: { label: "Failed", bg: "var(--danger-bg)", text: "var(--danger)" },
  unpublished: { label: "Unpublished", bg: "var(--surface-muted)", text: "var(--muted)" },
};

// A dedicated page (not a bottom-sheet modal) for the full "review the exact
// mapping, fix what's missing, pick which account, publish" workflow - a
// task with this many moving parts deserves real screen space, not a cramped
// sheet. Reachable from the Property Finder card on the listing detail page.
export default function PropertyFinderPublishPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const id = params.id as string;

  const [listing, setListing] = useState<ListingDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [detailsLang, setDetailsLang] = useState<"en" | "ar">("en");
  const [reference, setReference] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [pfLocationId, setPfLocationId] = useState<number | null>(null);
  const [pfLocationLabel, setPfLocationLabel] = useState<string | null>(null);

  const [options, setOptions] = useState<PFUserOption[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionNotice, setActionNotice] = useState<"published" | "unpublished" | "draft" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [credits, setCredits] = useState<{
    accountBalance: { remaining: number; total: number } | null;
    usedByThisListing: number | null;
    publishOptions: { name: string; total: number }[] | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/listings/${id}`);
    if (res.ok) {
      const data = await res.json();
      const l: ListingDTO = data.listing;
      setListing(l);
      setTitle(l.title ?? "");
      setDescription(l.description ?? "");
      setTitleAr(l.titleAr ?? "");
      setDescriptionAr(l.descriptionAr ?? "");
      setAmenities(filterAmenitiesForCategory(l.propertyCategory, l.amenities));
      setPfLocationId(l.pfLocationId);
      setReference(l.propertyFinderState?.reference ?? "");
      // Prefer this listing's own override; otherwise fall back to whichever
      // Property Finder account this agent last used (User.pfPublicProfileId,
      // kept up to date by the save below) - so their own account shows up
      // pre-selected by default on any listing, not just the first one.
      setSelectedProfileId(l.propertyFinderState?.assignedProfileId ?? l.createdBy.pfPublicProfileId ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCredits = useCallback(async () => {
    try {
      // Scoped to this listing and the specific account it publishes
      // under - not the company-wide total. Passing the currently selected
      // (possibly unsaved) account so switching it in the picker updates
      // this balance right away instead of only after Save.
      const query = selectedProfileId ? `?profileId=${selectedProfileId}` : "";
      const res = await fetch(`/api/listings/${id}/propertyfinder/credits${query}`);
      const data = await res.json();
      if (res.ok) setCredits(data);
    } catch {
      // Non-critical - just don't show the credits line if this fails.
    }
  }, [id, selectedProfileId]);

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/portals/propertyfinder/users");
        const data = await res.json();
        if (!res.ok) {
          setLoadError(extractErrorMessage(data.error, "Failed to load Property Finder accounts"));
          return;
        }
        setOptions(data.users);
      } catch {
        setLoadError("Network error. Please try again.");
      }
    })();
  }, []);

  if (loading) return <PropertyDetailSkeleton />;

  if (!listing) {
    return (
      <div className="px-4 py-16 text-center text-muted">
        <p>Property not found.</p>
      </div>
    );
  }

  const isOwner = session?.user?.id === listing.createdById;
  const isAdmin = session?.user?.role === "ADMIN";
  const canManage = isOwner || isAdmin;

  if (!canManage) {
    return (
      <div className="px-4 py-16 text-center text-muted">
        <p>You can only manage Property Finder publishing for your own listings.</p>
      </div>
    );
  }

  const isLand = listing.propertyCategory === "LAND";
  const { category, type } = pfCategoryAndType(listing.propertyCategory);
  const isRent = listing.listingType === "RENT";
  const price = isRent ? listing.rentPrice : listing.salePrice;
  const effectiveAssignedProfileId = selectedProfileId ?? listing.createdBy.pfPublicProfileId;
  const chosenOption = options?.find((o) => o.publicProfileId === effectiveAssignedProfileId);
  const amenityOptions = amenityOptionsFor(listing.propertyCategory);
  const badge = listing.propertyFinderState?.state ? STATE_LABELS[listing.propertyFinderState.state] : null;

  const missing: string[] = [];
  if (!title.trim()) missing.push("title");
  if (!description.trim()) missing.push("description");
  // Bathrooms is set on the listing itself (Add/Edit Property), not here -
  // this only flags it as still missing, pointing the agent back there
  // rather than duplicating the field on this page.
  if (!isLand && !listing.bathrooms) missing.push("bathrooms (set this on the listing itself)");
  if (listing.images.length === 0) missing.push("photos");
  if (!pfLocationId) missing.push("location");
  if (!effectiveAssignedProfileId) missing.push("Property Finder account");

  async function saveListingFields(): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || null,
        description: description.trim() || null,
        titleAr: titleAr.trim() || null,
        descriptionAr: descriptionAr.trim() || null,
        amenities,
        pfLocationId,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, error: extractErrorMessage(data?.error, "Failed to save listing details") };
    }
    return { ok: true };
  }

  async function savePropertyFinderState(publish: boolean | null): Promise<{ ok: boolean; error?: string; reasons?: string[] }> {
    const body: Record<string, unknown> = { assignedProfileId: selectedProfileId, reference: reference.trim() || null };
    if (publish !== null) body.enabled = publish;
    const res = await fetch(`/api/listings/${id}/propertyfinder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.reasons ? undefined : extractErrorMessage(data.error, "Something went wrong"), reasons: data.reasons };
    }
    return { ok: true };
  }

  async function handleSave(publish: boolean | null) {
    setError(null);
    setReasons([]);
    setActionNotice(null);
    setSaving(true);
    try {
      const savedListing = await saveListingFields();
      if (!savedListing.ok) {
        setError(savedListing.error ?? "Failed to save");
        return;
      }
      const savedState = await savePropertyFinderState(publish);
      if (!savedState.ok) {
        if (savedState.reasons) setReasons(savedState.reasons);
        else setError(savedState.error ?? "Something went wrong");
        // Reload even on failure - a failed publish attempt still persists
        // state: publishing_failed + lastError on the listing, and the agent
        // needs to see that (badge + banner), not just this inline message.
        await load();
        return;
      }
      await load();
      await loadCredits();
      setActionNotice(publish === true ? "published" : publish === false ? "unpublished" : "draft");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Recovery action for a listing PF seems to have permanently cached a bad
  // photo fetch for (updates never re-trigger a fresh image fetch on their
  // side) - unpublishes and forgets the remote listing id, so the next Save
  // & Publish creates a brand-new PF listing instead of updating the broken
  // one. Uses a native confirm() rather than a two-tap button state - on a
  // touch UI a second tap can land after the button (or the page) has
  // already lost focus/reflowed, silently resetting a two-tap "are you
  // sure" back to its first state with no visible error, which is exactly
  // what happened testing this the first time.
  async function handleReset() {
    if (!window.confirm("Unpublish this Property Finder listing and forget its link? The next Save & Publish will create a brand-new listing there instead of updating this one.")) {
      return;
    }
    setError(null);
    setResetting(true);
    try {
      const res = await fetch(`/api/listings/${id}/propertyfinder/reset`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(extractErrorMessage(data.error, "Failed to reset"));
        return;
      }
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  const enabled = listing.propertyFinderState?.enabled ?? false;

  return (
    <div className="px-4 pb-10">
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center gap-3">
        <button type="button" onClick={() => router.back()} aria-label="Go back" className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center shrink-0 active:opacity-70">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate">Publish to Property Finder</h1>
          <p className="text-[12px] text-muted truncate">{listing.buildingName}</p>
        </div>
        {badge && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: badge.bg, color: badge.text }}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {credits && (
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-[13px] flex flex-col gap-1.5">
            {credits.accountBalance ? (
              <div className="flex items-center justify-between">
                <span className="text-muted">{chosenOption ? `${chosenOption.name}'s` : "This account's"} credits remaining</span>
                <span className="font-semibold">
                  {credits.accountBalance.remaining.toLocaleString()}{" "}
                  <span className="text-muted font-normal">/ {credits.accountBalance.total.toLocaleString()}</span>
                </span>
              </div>
            ) : (
              <div className="text-muted">Pick a Property Finder account to see its credit balance.</div>
            )}
            {credits.usedByThisListing !== null && (
              <div className="flex items-center justify-between">
                <span className="text-muted">Used by this listing so far</span>
                <span className="font-semibold">{credits.usedByThisListing.toLocaleString()}</span>
              </div>
            )}
            {credits.publishOptions && credits.publishOptions.length > 0 && (
              <div className="flex flex-col gap-1 pt-1 border-t border-border mt-0.5">
                <span className="text-muted">Publishing options</span>
                {(() => {
                  // Matches the server's own selection logic - the cheapest
                  // tier is what actually gets used when publishing from
                  // here, regardless of what PF happens to name it.
                  const cheapest = credits.publishOptions!.reduce((min, o) => (o.total < min.total ? o : min));
                  return credits.publishOptions!.map((opt) => {
                    const isUsed = opt.name === cheapest.name && opt.total === cheapest.total;
                    return (
                      <div key={opt.name} className="flex items-center justify-between">
                        <span className={isUsed ? "font-semibold capitalize" : "text-muted capitalize"}>
                          {opt.name}
                          {isUsed && <span className="text-muted font-normal"> (used here)</span>}
                        </span>
                        <span className={isUsed ? "font-semibold" : "text-muted"}>{opt.total.toLocaleString()} credits</span>
                      </div>
                    );
                  });
                })()}
                <p className="text-[11px] text-muted">
                  This app always publishes at the lowest tier. Upgrade to a higher tier from PF Expert directly if needed.
                </p>
              </div>
            )}
          </div>
        )}

        {listing.propertyFinderState?.lastError && (
          <div className="rounded-2xl bg-danger-bg text-danger text-sm px-4 py-3">{listing.propertyFinderState.lastError}</div>
        )}

        <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
          <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Listing Details</h3>
          <div className="flex flex-col gap-3">
            <div>
              <SegmentedControl
                options={[
                  { label: "English", value: "en" },
                  { label: "Arabic", value: "ar" },
                ]}
                value={detailsLang}
                onChange={setDetailsLang}
              />
            </div>
            {detailsLang === "en" ? (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Title <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Spacious 2BR with Marina View"
                    maxLength={50}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary"
                  />
                  <div className="text-right text-[12px] text-muted mt-1">{title.length}/50</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Description <span className="text-danger">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the property..."
                    rows={4}
                    maxLength={2000}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary resize-none"
                  />
                  <div className="text-right text-[12px] text-muted mt-1">{description.length}/2000</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Title <span className="text-muted font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    placeholder="مثال: شقة فسيحة غرفتين نوم بإطلالة على المارينا"
                    maxLength={50}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary"
                  />
                  <div className="text-right text-[12px] text-muted mt-1">{titleAr.length}/50</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Description <span className="text-muted font-normal">(optional)</span>
                  </label>
                  <textarea
                    dir="rtl"
                    value={descriptionAr}
                    onChange={(e) => setDescriptionAr(e.target.value)}
                    placeholder="صف العقار..."
                    rows={4}
                    maxLength={2000}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary resize-none"
                  />
                  <div className="text-right text-[12px] text-muted mt-1">{descriptionAr.length}/2000</div>
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Reference Number <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={`Default: LE-${listing.id}`}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary"
              />
              <p className="text-[12px] text-muted mt-1">Must be unique across your whole Property Finder account. Leave blank to use the default.</p>
            </div>
            {!isLand && amenityOptions.length > 0 && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Amenities <span className="text-muted font-normal">(optional)</span>
                </label>
                <MultiChipSelect options={amenityOptions} value={amenities} onChange={setAmenities} />
              </div>
            )}
            <PropertyFinderLocationPicker
              value={pfLocationId}
              valueLabel={pfLocationLabel}
              onChange={(pid, label) => {
                setPfLocationId(pid);
                setPfLocationLabel(label);
              }}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
          <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Also Sent (from the listing itself)</h3>
          <dl>
            <Row label="Reference" value={reference.trim() || `LE-${listing.id} (default)`} />
            <Row label="Category / Type" value={`${category} / ${type}`} />
            <Row label="Furnishing" value={PF_FURNISHING_TYPE[listing.furnished]} />
            {listing.bedrooms && <Row label="Bedrooms" value={BEDROOM_LABELS[listing.bedrooms]} />}
            {!isLand && <Row label="Bathrooms" value={listing.bathrooms ?? "Not set"} />}
            <Row label="Size" value={listing.sizeSqm ? `${listing.sizeSqm} sqm` : "—"} />
            <Row label="Price" value={price ? `${formatQAR(price)}${isRent ? "/month" : ""}` : "Not set"} />
            <Row label="Photos" value={listing.images.length} />
            <Row label="Listing Level" value="Standard" />
          </dl>
          <p className="text-[12px] text-muted mt-2">
            Every listing publishes at Property Finder&apos;s standard tier - Featured/Premium upgrades are a separate paid step this app doesn&apos;t do automatically.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
          <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Publish As</h3>
          {loadError && <p className="text-sm text-danger">{loadError}</p>}
          {!loadError && !options && (
            <div className="flex flex-col gap-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-surface-muted animate-pulse" />
              ))}
            </div>
          )}
          {options && isAdmin && (
            <SearchableSelect
              value={selectedProfileId !== null ? String(selectedProfileId) : null}
              onChange={(v) => setSelectedProfileId(v ? Number(v) : null)}
              options={options.map((opt) => ({ label: `${opt.name} — ${opt.email}`, value: String(opt.publicProfileId) }))}
              placeholder="Select a Property Finder account"
              searchPlaceholder="Search agents by name or email..."
            />
          )}
          {/* Agents only ever see their own linked account, read-only -
              choosing which account a listing publishes under (including
              overriding it to someone else's) is an admin capability. */}
          {options && !isAdmin && chosenOption && (
            <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
              <div className="font-medium text-[14px]">{chosenOption.name}</div>
              <div className="text-muted text-[12px]">{chosenOption.email}</div>
            </div>
          )}
          {selectedProfileId === null && !listing.createdBy.pfPublicProfileId && (
            <p className="text-danger text-[12px] mt-1.5">
              {isAdmin
                ? `${listing.createdBy.name} isn't linked to a Property Finder account yet - ask an admin.`
                : "You're not linked to a Property Finder account yet - ask an admin to link one for you."}
            </p>
          )}
          {isAdmin && chosenOption && <p className="text-[12px] text-muted mt-2">Publishing as {chosenOption.name}.</p>}
        </section>

        {missing.length > 0 && (
          <div className="rounded-2xl bg-danger-bg text-danger text-[13px] px-4 py-3">Still needed to publish: {missing.join(", ")}.</div>
        )}
        {reasons.length > 0 && (
          <ul className="text-[13px] text-danger list-disc list-inside px-1">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {error && <div className="rounded-2xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}
        {actionNotice && (
          <div
            className="rounded-2xl px-4 py-3 flex items-start gap-3"
            style={
              actionNotice === "published"
                ? { background: "var(--success-bg)" }
                : actionNotice === "draft"
                  ? { background: "var(--accent-light)" }
                  : { background: "var(--surface-muted)" }
            }
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "rgba(255,255,255,0.55)",
                color: actionNotice === "published" ? "var(--success)" : actionNotice === "draft" ? "var(--primary)" : "var(--muted)",
              }}
            >
              {actionNotice === "published" && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {actionNotice === "draft" && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                  <path d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
              )}
              {actionNotice === "unpublished" && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.1 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.1-1.5" />
                  <path d="m4 4 16 16" />
                </svg>
              )}
            </span>
            <div className="min-w-0">
              <p
                className="text-[14px] font-semibold"
                style={{ color: actionNotice === "published" ? "var(--success)" : actionNotice === "draft" ? "var(--primary)" : "var(--foreground)" }}
              >
                {actionNotice === "published" && "Listing published"}
                {actionNotice === "draft" && "Saved as draft"}
                {actionNotice === "unpublished" && "Listing unpublished"}
              </p>
              <p className="text-[12px] text-muted mt-0.5">
                {actionNotice === "published" && (badge ? `Property Finder status: ${badge.label}` : "Sent to Property Finder.")}
                {actionNotice === "draft" && "Not published to Property Finder yet - publish anytime from here."}
                {actionNotice === "unpublished" && "No longer visible on Property Finder."}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-1">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="w-full rounded-xl py-3 text-[14px] font-semibold active:opacity-70"
            style={{ background: "var(--accent-light)", color: "var(--primary)" }}
          >
            Preview Listing
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving || !options}
            className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60"
            style={{ background: "var(--primary)" }}
          >
            {saving ? "Saving..." : "Save & Publish to Property Finder"}
          </button>
          <button
            type="button"
            onClick={() => handleSave(null)}
            disabled={saving || !options}
            className="w-full rounded-xl py-3 text-[14px] font-semibold text-foreground bg-surface-muted active:opacity-70 disabled:opacity-60"
          >
            Save as Draft
          </button>
          {enabled && (
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="w-full rounded-xl py-3 text-[14px] font-semibold bg-danger-bg text-danger active:opacity-70 disabled:opacity-60"
            >
              Unpublish from Property Finder
            </button>
          )}
          {isAdmin && listing.propertyFinderState?.remoteListingId && (
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="w-full rounded-xl py-3 text-[13px] font-semibold border border-danger text-danger active:opacity-70 disabled:opacity-60"
            >
              {resetting ? "Resetting..." : "Reset Property Finder listing"}
            </button>
          )}
        </div>
      </div>

      <PropertyFinderPreviewSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        listing={listing}
        title={detailsLang === "en" ? title.trim() : titleAr.trim()}
        description={detailsLang === "en" ? description.trim() : descriptionAr.trim()}
        lang={detailsLang}
        reference={reference.trim() || `LE-${listing.id}`}
        bathrooms={listing.bathrooms}
        amenities={amenities}
        locationLabel={pfLocationLabel}
        categoryTypeLabel={`${category} / ${type}`}
        agentName={chosenOption?.name ?? null}
      />
    </div>
  );
}
