"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ListingDTO, PullChannel } from "@/lib/types";
import { getPfStatus, PF_TONE_COLORS } from "@/lib/propertyFinder/status";
import AiWriteButton from "@/components/AiWriteButton";
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
  draft: { label: "Draft on PF", bg: "var(--surface-muted)", text: "var(--muted)" },
  takendown: { label: "Taken Down", bg: "var(--danger-bg)", text: "var(--danger)" },
  archived: { label: "Archived", bg: "var(--surface-muted)", text: "var(--muted)" },
};

function badgeFor(state: string | null | undefined): { label: string; bg: string; text: string } | null {
  if (!state) return null;
  return STATE_LABELS[state] ?? { label: state.charAt(0).toUpperCase() + state.slice(1), bg: "var(--surface-muted)", text: "var(--foreground)" };
}

const PULL_CHANNELS: { key: PullChannel; label: string; slug: string | null; desc: string; type: "json" | "xml" | "api" }[] = [
  { key: "WEBSITE", label: "Company Website", slug: "website.json", desc: "JSON feed for your official website", type: "json" },
  // No copyable feed link - Qatar Living's real listings API
  // (app/api/qatar-living/listings) authenticates with an API key managed
  // from the Profile page, not a URL token (see components/QatarLivingApiCard).
  { key: "QATAR_LIVING", label: "Qatar Living", slug: null, desc: "Listed via the Qatar Living API (manage the key on your Profile page)", type: "api" },
  { key: "PROPERTY_ORYX", label: "Property Oryx", slug: "oryx.xml", desc: "XML feed for Property Oryx portal import", type: "xml" },
  { key: "OTHER_PORTALS", label: "Other Portals (XML)", slug: "all.xml", desc: "One master XML feed any other portal can pull (not Property Finder)", type: "xml" },
];

export default function MultiPortalPublishingPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState<"PF" | "CHANNELS">("PF");
  const [listing, setListing] = useState<ListingDTO | null>(null);
  const [loading, setLoading] = useState(true);

  // Property Finder Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [detailsLang, setDetailsLang] = useState<"en" | "ar">("en");
  const [aiBusy, setAiBusy] = useState<"title" | "description" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
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

  // Pull channels state
  const [channelBusy, setChannelBusy] = useState<Record<string, boolean>>({});
  const [channelErrors, setChannelErrors] = useState<Record<string, string[]>>({});
  const [feedCredentials, setFeedCredentials] = useState<Record<string, { agencyId: string | null; token: string | null }>>({});
  const [copiedFeed, setCopiedFeed] = useState<string | null>(null);

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
      setPfLocationLabel(l.pfLocation ? l.pfLocation.tree.map((t) => t.name).join(", ") || l.pfLocation.name : null);
      setReference(l.propertyFinderState?.reference ?? "");
      setSelectedProfileId(l.propertyFinderState?.assignedProfileId ?? l.createdBy.pfPublicProfileId ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Load feed credentials for agency + tokens
  const loadFeedCredentials = useCallback(async () => {
    try {
      const portals: PullChannel[] = ["WEBSITE", "QATAR_LIVING", "PROPERTY_ORYX", "OTHER_PORTALS"];
      const results: Record<string, { agencyId: string | null; token: string | null }> = {};
      await Promise.all(
        portals.map(async (p) => {
          const res = await fetch(`/api/admin/portals/${p}`);
          if (res.ok) {
            const data = await res.json();
            results[p] = { agencyId: data.feedAgencyId ?? null, token: data.feedToken ?? null };
          }
        })
      );
      setFeedCredentials(results);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadFeedCredentials();
  }, [loadFeedCredentials]);

  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const refreshedRemoteIdRef = useRef<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusRefreshing(true);
    try {
      const res = await fetch(`/api/listings/${id}/propertyfinder/refresh`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setListing((prev) => (prev ? { ...prev, propertyFinderState: data.propertyFinderState } : prev));
      }
    } catch {
      // Non-critical
    } finally {
      setStatusRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    const remoteId = listing?.propertyFinderState?.remoteListingId;
    if (remoteId && refreshedRemoteIdRef.current !== remoteId) {
      refreshedRemoteIdRef.current = remoteId;
      refreshStatus();
    }
  }, [listing?.propertyFinderState?.remoteListingId, refreshStatus]);

  // While Property Finder is still processing a publish, keep asking it for
  // the real stage (every 8s, up to ~2 minutes) so the page flips to "Live" on
  // its own instead of sitting on "Publishing…" until someone taps Refresh.
  const isPublishingNow = getPfStatus(listing?.propertyFinderState).kind === "publishing";
  useEffect(() => {
    if (!isPublishingNow) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (attempts > 15) {
        clearInterval(timer);
        return;
      }
      refreshStatus();
    }, 8000);
    return () => clearInterval(timer);
  }, [isPublishingNow, refreshStatus]);

  const loadCredits = useCallback(async () => {
    try {
      const query = selectedProfileId ? `?profileId=${selectedProfileId}` : "";
      const res = await fetch(`/api/listings/${id}/propertyfinder/credits${query}`);
      const data = await res.json();
      if (res.ok) setCredits(data);
    } catch {
      // Non-critical
    }
  }, [id, selectedProfileId]);

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/portals/propertyfinder/users");
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setLoadError(extractErrorMessage(data?.error, "Failed to load Property Finder accounts"));
          return;
        }
        if (data?.users) {
          setOptions(data.users);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Network error. Please try again.");
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
        <p>You can only manage portal publishing for your own listings.</p>
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
  const pfView = getPfStatus(listing.propertyFinderState);
  const badge = listing.propertyFinderState?.remoteListingId
    ? { label: pfView.label, ...PF_TONE_COLORS[pfView.tone] }
    : badgeFor(listing.propertyFinderState?.state);

  const missing: string[] = [];
  if (!title.trim()) missing.push("title");
  if (!description.trim()) missing.push("description");
  if (!isLand && !listing.bathrooms) missing.push("bathrooms");
  if (listing.images.length === 0) missing.push("photos");
  if (!pfLocationId) missing.push("location");
  if (!effectiveAssignedProfileId) missing.push("Property Finder account");
  if (!price || price <= 0) missing.push(isRent ? "monthly rent price (edit it on the listing page)" : "sale price (edit it on the listing page)");

  async function toggleChannel(portal: PullChannel, nextEnabled: boolean) {
    setChannelBusy((prev) => ({ ...prev, [portal]: true }));
    setChannelErrors((prev) => ({ ...prev, [portal]: [] }));
    try {
      const res = await fetch(`/api/listings/${id}/channels/${portal}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.reasons) setChannelErrors((prev) => ({ ...prev, [portal]: data.reasons }));
        else setChannelErrors((prev) => ({ ...prev, [portal]: [extractErrorMessage(data?.error, "Failed to update channel")] }));
        return;
      }
      if (data?.channelState) {
        setListing((prev) => (prev ? { ...prev, channelStates: { ...prev.channelStates, [portal]: data.channelState } } : prev));
      }
    } catch (err) {
      setChannelErrors((prev) => ({ ...prev, [portal]: [err instanceof Error ? err.message : "Network error"] }));
    } finally {
      setChannelBusy((prev) => ({ ...prev, [portal]: false }));
    }
  }

  // Asks the server (which holds the OpenAI key) to write the title and
  // description for the language tab currently shown. Fills the fields only -
  // the agent reviews/edits and saves with the rest of the form as usual.
  async function generateWithAi(field: "title" | "description") {
    const isEn = detailsLang === "en";
    const current = field === "title" ? (isEn ? title : titleAr) : isEn ? description : descriptionAr;
    if (current.trim() && !window.confirm(`Replace the current ${field} with AI-written text?`)) return;
    setAiError(null);
    setAiBusy(field);
    try {
      const res = await fetch(`/api/listings/${id}/generate-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: detailsLang, field, currentTitle: isEn ? title : titleAr, amenities, locationLabel: pfLocationLabel }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAiError(extractErrorMessage(data?.error, "Couldn't generate text"));
        return;
      }
      if (field === "title") (isEn ? setTitle : setTitleAr)(data.title);
      else (isEn ? setDescription : setDescriptionAr)(data.description);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setAiBusy(null);
    }
  }

  async function saveListingFields(): Promise<{ ok: boolean; error?: string }> {
    try {
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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, error: extractErrorMessage(data?.error, "Failed to save listing details") };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to save listing details" };
    }
  }

  async function savePropertyFinderState(publish: boolean | null): Promise<{ ok: boolean; error?: string; reasons?: string[] }> {
    try {
      const body: Record<string, unknown> = { assignedProfileId: selectedProfileId, reference: reference.trim() || null };
      if (publish !== null) body.enabled = publish;
      const res = await fetch(`/api/listings/${id}/propertyfinder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, error: data?.reasons ? undefined : extractErrorMessage(data?.error, "Something went wrong"), reasons: data?.reasons };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to update Property Finder state" };
    }
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
        await load();
        return;
      }
      await load();
      if (publish === true) await refreshStatus();
      await loadCredits();
      setActionNotice(publish === true ? "published" : publish === false ? "unpublished" : "draft");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Unpublish this Property Finder listing and forget its link? The next Save & Publish will create a brand-new listing there instead of updating this one.")) {
      return;
    }
    setError(null);
    setResetting(true);
    try {
      const res = await fetch(`/api/listings/${id}/propertyfinder/reset`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(extractErrorMessage(data?.error, "Failed to reset"));
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  async function copyFeedUrl(slug: string, portalKey: string) {
    const cred = feedCredentials[portalKey];
    if (!cred?.agencyId || !cred?.token || typeof window === "undefined") return;
    const url = `${window.location.origin}/feeds/${slug}?agency=${encodeURIComponent(cred.agencyId)}&token=${cred.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedFeed(slug);
      setTimeout(() => setCopiedFeed(null), 1500);
    } catch {
      // Clipboard denied
    }
  }

  // "Published" means Property Finder has it live or is processing it - not
  // just that this app's own flag was set.
  const enabled = pfView.active;
  const pfState = listing.propertyFinderState?.state ?? null;
  const neverPublished = !listing.propertyFinderState?.remoteListingId;
  const isLive = pfState === "live";
  const isFailed = pfState === "publishing_failed" || pfState === "takendown";
  const publishLabel = saving
    ? "Saving..."
    : neverPublished
      ? "Save & Publish to Property Finder"
      : isFailed
        ? "Retry Publish to Property Finder"
        : isLive
          ? "Update Live Listing"
          : "Save & Publish to Property Finder";

  return (
    <div className="px-4 pb-12">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center gap-3 border-b border-border/50">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center shrink-0 active:opacity-70"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold truncate">Publishing Hub</h1>
          <p className="text-[12px] text-muted truncate">{listing.buildingName} · {listing.area}</p>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl bg-accent-light text-primary active:opacity-70"
        >
          Preview
        </button>
      </div>

      {/* Main Mode Navigation Tabs */}
      <div className="flex rounded-2xl bg-surface-muted p-1 mt-4">
        <button
          type="button"
          onClick={() => setActiveTab("PF")}
          className="flex-1 py-2.5 text-[13px] font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          style={activeTab === "PF" ? { background: "var(--surface)", color: "var(--foreground)", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } : { color: "var(--muted)" }}
        >
          <span>🏆 Property Finder</span>
          {badge && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: badge.bg, color: badge.text }}>
              {badge.label}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("CHANNELS")}
          className="flex-1 py-2.5 text-[13px] font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          style={activeTab === "CHANNELS" ? { background: "var(--surface)", color: "var(--foreground)", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } : { color: "var(--muted)" }}
        >
          <span>🌐 Other Channels</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-muted font-bold text-muted">
            3 Feeds
          </span>
        </button>
      </div>

      {/* TAB 1: PROPERTY FINDER PUSH HUB */}
      {activeTab === "PF" && (
        <div className="flex flex-col gap-4 mt-4">
          {/* Property Finder Readiness / Checklist Alert */}
          {enabled ? (
            <div className="rounded-2xl bg-success-bg text-success border border-success/30 text-[13px] p-4 flex items-start gap-3 shadow-sm">
              <span className="text-xl">✅</span>
              <div>
                <p className="font-bold text-[14px]">{pfView.kind === "live" ? "Live on Property Finder" : "Sent to Property Finder"}</p>
                <p className="mt-0.5 opacity-90">
                  {pfView.kind === "live"
                    ? "This property is live. Use Update Live Listing to push edits - it updates the same listing, never a duplicate."
                    : "Property Finder is processing this listing. Tap Refresh Status in a moment to see when it goes live."}
                </p>
              </div>
            </div>
          ) : pfView.kind === "failed" || pfView.kind === "not_live" ? (
            <div className="notice-warning rounded-2xl text-[13px] p-4 flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-bold">{pfView.label} - not live on Property Finder</p>
                <p className="mt-0.5 opacity-90">
                  {pfView.detail}
                  {missing.length > 0 ? ` Before publishing, complete: ${missing.join(", ")}.` : " Fix any issue shown below, then publish again."}
                </p>
              </div>
            </div>
          ) : missing.length > 0 ? (
            <div className="notice-warning rounded-2xl text-[13px] p-4 flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-bold">Property Finder Readiness Checklist</p>
                <p className="mt-0.5 opacity-90">To publish on Property Finder, please complete: <strong className="underline">{missing.join(", ")}</strong>.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-success-bg text-success text-[13px] p-3.5 flex items-center gap-2.5 font-medium">
              <span>✅</span>
              <span>This listing is 100% ready for Property Finder publishing!</span>
            </div>
          )}
          {listing.propertyFinderState?.remoteListingId && (
            <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-[12px] flex flex-col gap-2 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-muted">
                    PF listing ID <span className="font-mono text-foreground font-semibold">{listing.propertyFinderState.remoteListingId}</span>
                  </p>
                  {listing.propertyFinderState.lastSyncedAt && (
                    <p className="text-muted mt-0.5">Checked {new Date(listing.propertyFinderState.lastSyncedAt).toLocaleString()}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={refreshStatus}
                  disabled={statusRefreshing}
                  className="shrink-0 text-[12px] font-semibold px-3 py-2 rounded-lg bg-surface-muted active:opacity-70 disabled:opacity-60"
                >
                  {statusRefreshing ? "Checking..." : "Refresh Status"}
                </button>
              </div>
            </div>
          )}

          {credits && (
            <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-[13px] flex flex-col gap-1.5 shadow-sm">
              {credits.accountBalance ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted">{chosenOption ? `${chosenOption.name}'s` : "Account"} credits</span>
                  <span className="font-semibold">
                    {credits.accountBalance.remaining.toLocaleString()}{" "}
                    <span className="text-muted font-normal">/ {credits.accountBalance.total.toLocaleString()}</span>
                  </span>
                </div>
              ) : (
                <div className="text-muted">Select a Property Finder account to view credit balance.</div>
              )}
              {credits.usedByThisListing !== null && (
                <div className="flex items-center justify-between pt-1.5 border-t border-border">
                  <span className="text-muted">Credits spent on this listing</span>
                  <span className="font-semibold">{credits.usedByThisListing.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {listing.propertyFinderState?.lastError && (
            <div className="rounded-2xl bg-danger-bg text-danger text-sm px-4 py-3">
              <p className="font-semibold mb-1">Property Finder rejected this - fix the following, then publish again:</p>
              <ul className="list-disc list-inside">
                {listing.propertyFinderState.lastError.split("; ").map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Listing Details for Property Finder</h3>
            <div className="flex flex-col gap-3">
              <SegmentedControl
                options={[
                  { label: "English", value: "en" },
                  { label: "Arabic", value: "ar" },
                ]}
                value={detailsLang}
                onChange={setDetailsLang}
              />

              {aiError && <div className="rounded-xl bg-danger-bg text-danger text-[13px] px-3 py-2.5">{aiError}</div>}

              {detailsLang === "en" ? (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Title <span className="text-danger">*</span>
                      </label>
                      <AiWriteButton onClick={() => generateWithAi("title")} busy={aiBusy === "title"} disabled={aiBusy !== null} />
                    </div>
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
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Description <span className="text-danger">*</span>
                      </label>
                      <AiWriteButton onClick={() => generateWithAi("description")} busy={aiBusy === "description"} disabled={aiBusy !== null} />
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the property..."
                      rows={9}
                      maxLength={2000}
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary resize-none"
                    />
                    <div className="text-right text-[12px] text-muted mt-1">{description.length}/2000</div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-foreground">Title (Arabic)</label>
                      <AiWriteButton onClick={() => generateWithAi("title")} busy={aiBusy === "title"} disabled={aiBusy !== null} label="Write Arabic with AI" />
                    </div>
                    <input
                      type="text"
                      dir="rtl"
                      value={titleAr}
                      onChange={(e) => setTitleAr(e.target.value)}
                      placeholder="مثال: شقة فسيحة غرفتين نوم"
                      maxLength={50}
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary"
                    />
                    <div className="text-right text-[12px] text-muted mt-1">{titleAr.length}/50</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-foreground">Description (Arabic)</label>
                      <AiWriteButton onClick={() => generateWithAi("description")} busy={aiBusy === "description"} disabled={aiBusy !== null} label="Write Arabic with AI" />
                    </div>
                    <textarea
                      dir="rtl"
                      value={descriptionAr}
                      onChange={(e) => setDescriptionAr(e.target.value)}
                      placeholder="صف العقار..."
                      rows={9}
                      maxLength={2000}
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary resize-none"
                    />
                    <div className="text-right text-[12px] text-muted mt-1">{descriptionAr.length}/2000</div>
                  </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Reference Number</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={`Default: LE-${listing.id}`}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary"
                />
              </div>

              {!isLand && amenityOptions.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Amenities</label>
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
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Publish As</h3>
            {loadError && <p className="text-sm text-danger">{loadError}</p>}
            {options && (
              <SearchableSelect
                value={selectedProfileId !== null ? String(selectedProfileId) : null}
                onChange={(v) => setSelectedProfileId(v ? Number(v) : null)}
                options={options.map((opt) => ({ label: `${opt.name} — ${opt.email}`, value: String(opt.publicProfileId) }))}
                placeholder="Select a Property Finder account"
                searchPlaceholder="Search agents..."
              />
            )}
          </section>

          {reasons.length > 0 && (
            <div className="rounded-2xl bg-danger-bg text-danger text-[13px] px-4 py-3">
              <p className="font-semibold mb-1">Property Finder rejected this:</p>
              <ul className="list-disc list-inside">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {error && <div className="rounded-2xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

          {actionNotice && (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-success-bg text-success font-semibold text-sm">
              <span>✅</span>
              <span>
                {actionNotice === "published" && "Listing published to Property Finder!"}
                {actionNotice === "draft" && "Listing details saved in app!"}
                {actionNotice === "unpublished" && "Listing unpublished from Property Finder."}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2.5 mt-1">
            {enabled ? (
              <>
                <button
                  type="button"
                  disabled
                  className="w-full rounded-xl py-4 text-base font-bold text-white opacity-90 cursor-not-allowed shadow-md flex items-center justify-center gap-2"
                  style={{ background: "var(--success)" }}
                >
                  <span>{pfView.kind === "live" ? "✓ Live on Property Finder" : "⏳ Publishing on Property Finder…"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving || !options || missing.length > 0}
                  className="w-full rounded-xl py-3.5 text-[14px] font-bold text-white active:opacity-80 disabled:opacity-60"
                  style={{ background: "var(--primary)" }}
                >
                  {saving ? "Updating..." : "Update Live Listing"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(null)}
                  disabled={saving}
                  className="w-full rounded-xl py-3 text-[14px] font-semibold text-foreground bg-surface-muted active:opacity-70 disabled:opacity-60"
                >
                  {saving ? "Saving Details..." : "Save Details to App"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="w-full rounded-xl py-3 text-[14px] font-semibold bg-danger-bg text-danger active:opacity-70 disabled:opacity-60"
                >
                  {saving ? "Unpublishing..." : "Unpublish from Property Finder"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving || !options || missing.length > 0}
                  className="w-full rounded-xl py-4 text-base font-bold text-white active:opacity-80 disabled:opacity-60 shadow-md"
                  style={{ background: isFailed ? "var(--danger)" : "var(--primary)" }}
                >
                  {publishLabel}
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(null)}
                  disabled={saving || !options}
                  className="w-full rounded-xl py-3 text-[14px] font-semibold text-foreground bg-surface-muted active:opacity-70 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Details to App (Draft)"}
                </button>
              </>
            )}
            {isAdmin && listing.propertyFinderState?.remoteListingId && (
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="w-full rounded-xl py-3 text-[13px] font-semibold border border-danger text-danger active:opacity-70 disabled:opacity-60"
              >
                {resetting ? "Resetting..." : "Reset Property Finder Listing"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PULL CHANNELS (WEBSITE, QATAR LIVING, PROPERTY ORYX) */}
      {activeTab === "CHANNELS" && (
        <div className="flex flex-col gap-4 mt-4">
          {PULL_CHANNELS.map((ch) => {
            const isChannelEnabled = listing.channelStates?.[ch.key]?.enabled ?? false;
            const isBusy = channelBusy[ch.key];
            const errors = channelErrors[ch.key];
            const cred = feedCredentials[ch.key];

            return (
              <section key={ch.key} className="rounded-2xl border border-border bg-surface shadow-sm p-4.5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-bold">{ch.label}</h3>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-surface-muted text-muted font-mono">{ch.type}</span>
                    </div>
                    <p className="text-[12px] text-muted mt-0.5">{ch.desc}</p>
                  </div>
                  <span
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={isChannelEnabled ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--surface-muted)", color: "var(--muted)" }}
                  >
                    {isChannelEnabled ? "✓ Already Published" : "Off"}
                  </span>
                </div>

                {isChannelEnabled && (
                  <div className="text-[13px] font-semibold text-success bg-success-bg p-3 rounded-xl flex items-center gap-2 border border-success/20">
                    <span>✅ Already Published to {ch.label}</span>
                  </div>
                )}

                {errors && errors.length > 0 && (
                  <div className="text-[12px] text-danger bg-danger-bg p-2.5 rounded-xl">
                    Still needed: {errors.join(", ")}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  {isChannelEnabled ? (
                    <>
                      <button
                        type="button"
                        disabled
                        className="flex-1 rounded-xl py-3 text-[14px] font-bold text-white bg-success opacity-90 cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <span>✓ Already Published</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => toggleChannel(ch.key, false)}
                        className="rounded-xl px-4 py-3 text-[13px] font-semibold bg-danger-bg text-danger active:opacity-70 disabled:opacity-60 shrink-0"
                      >
                        {isBusy ? "Updating..." : "Unpublish"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => toggleChannel(ch.key, true)}
                      className="flex-1 rounded-xl py-3 text-[14px] font-bold text-white transition-all active:opacity-80 disabled:opacity-60"
                      style={{ background: "var(--primary)" }}
                    >
                      {isBusy ? "Updating..." : `Publish to ${ch.label}`}
                    </button>
                  )}

                  {ch.slug && cred?.agencyId && cred?.token && (
                    <button
                      type="button"
                      onClick={() => copyFeedUrl(ch.slug!, ch.key)}
                      className="rounded-xl px-3 py-3 text-[12px] font-semibold bg-surface-muted text-foreground active:opacity-70 shrink-0"
                    >
                      {copiedFeed === ch.slug ? "Copied Feed URL!" : "Copy Feed URL"}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

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
