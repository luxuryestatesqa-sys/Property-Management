"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ListingDTO } from "@/lib/types";
import { extractErrorMessage } from "@/lib/errors";
import { BEDROOM_LABELS, bedroomOptionsFor, isResidentialCategory } from "@/lib/propertyCategory";
import { AMENITY_LABELS, amenityOptionsFor, bathroomsFromInputValue, bathroomsToInputValue } from "@/lib/propertyFinder/mapping";
import { ORYX_AMENITY_CODES, ORYX_MAX_PHOTOS } from "@/lib/feeds/oryxCodes";
import { formatQAR } from "@/lib/format";

interface Problem {
  level: "error" | "warning" | "info";
  field: string;
  message: string;
}
interface Field {
  label: string;
  value: string;
  sent: string | null;
}
interface Review {
  enabled: boolean;
  xml: string | null;
  fields: Field[];
  problems: Problem[];
  ready?: boolean;
}

const SECTION_OF: Record<string, string> = { price: "oryx-basics", size: "oryx-basics", bedrooms: "oryx-basics", bathrooms: "oryx-basics", title: "oryx-text", description: "oryx-text", location: "oryx-location", amenities: "oryx-amenities", photos: "oryx-photos", agent: "oryx-agent", listing: "oryx-top" };

const card = "rounded-2xl border border-border bg-surface p-5 shadow-sm";
const inputCls = "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-[15px] outline-none focus:border-primary";
const labelCls = "mb-1.5 block text-[13px] font-medium text-slate-600";
const hint = "mt-1 text-[12px] text-muted";

interface Form {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  price: string;
  sizeSqm: string;
  bedrooms: string;
  bathrooms: string;
  furnished: "FURNISHED" | "UNFURNISHED";
  buildingName: string;
  amenities: string[];
}

function formFrom(l: ListingDTO): Form {
  return {
    title: l.titleOryx ?? l.title ?? "",
    titleAr: l.titleAr ?? "",
    description: l.description ?? "",
    descriptionAr: l.descriptionAr ?? "",
    price: String((l.listingType === "RENT" ? l.rentPrice : l.salePrice) ?? ""),
    sizeSqm: l.sizeSqm ? String(l.sizeSqm) : "",
    bedrooms: l.bedrooms ?? "",
    bathrooms: bathroomsToInputValue(l.bathrooms),
    furnished: l.furnished,
    buildingName: l.buildingName ?? "",
    amenities: l.amenities ?? [],
  };
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={`tnum text-[12px] ${value.length > max * 0.95 ? "text-amber-700" : "text-muted"}`}>
      {value.length}/{max}
    </span>
  );
}

export default function PropertyOryxPage() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<ListingDTO | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [view, setView] = useState<"preview" | "summary" | "xml">("preview");
  const [confirming, setConfirming] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [copied, setCopied] = useState(false);
  const [denied, setDenied] = useState("");

  const load = useCallback(async () => {
    const [lRes, rRes] = await Promise.all([fetch(`/api/listings/${id}`), fetch(`/api/listings/${id}/oryx`)]);
    if (rRes.status === 403) return setDenied("You can only review your own listings.");
    if (!lRes.ok || !rRes.ok) return setDenied("This listing couldn't be loaded.");
    const l: ListingDTO = (await lRes.json()).listing;
    setListing(l);
    setForm(formFrom(l));
    setReview(await rRes.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saved = useMemo(() => (listing ? formFrom(listing) : null), [listing]);
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save(): Promise<boolean> {
    if (!listing || !form || !saved) return false;
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {};
      const rent = listing.listingType === "RENT";
      const text = (v: string) => v.trim() || null;
      // Written to the Oryx-only title (up to 80 characters); left the same as the main title, Oryx keeps following it.
      if (form.title !== saved.title) body.titleOryx = form.title.trim() && form.title.trim() !== (listing.title ?? "").trim() ? form.title.trim() : null;
      if (form.titleAr !== saved.titleAr) body.titleAr = text(form.titleAr);
      if (form.description !== saved.description) body.description = text(form.description);
      if (form.descriptionAr !== saved.descriptionAr) body.descriptionAr = text(form.descriptionAr);
      if (form.price !== saved.price && Number(form.price) > 0) body[rent ? "rentPrice" : "salePrice"] = Number(form.price);
      if (form.sizeSqm !== saved.sizeSqm && Number(form.sizeSqm) > 0) body.sizeSqm = Number(form.sizeSqm);
      if (form.bedrooms !== saved.bedrooms && form.bedrooms) body.bedrooms = form.bedrooms;
      if (form.bathrooms !== saved.bathrooms && listing.propertyCategory !== "LAND") body.bathrooms = bathroomsFromInputValue(form.bathrooms);
      if (form.furnished !== saved.furnished) body.furnished = form.furnished;
      if (form.buildingName !== saved.buildingName && form.buildingName.trim()) body.buildingName = form.buildingName.trim();
      if (JSON.stringify(form.amenities) !== JSON.stringify(saved.amenities)) body.amenities = form.amenities;
      const res = await fetch(`/api/listings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ ok: false, text: extractErrorMessage(data?.error, "Couldn't save the changes.") });
        return false;
      }
      setMessage({ ok: true, text: review?.enabled ? "Saved. The change goes to Property Oryx the next time it reads your feed." : "Saved." });
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function setPublished(enabled: boolean) {
    setPublishing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/listings/${id}/channels/PROPERTY_ORYX`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setMessage({ ok: false, text: data?.reasons ? `Still needed: ${data.reasons.join(", ")}` : extractErrorMessage(data?.error, "Couldn't update Property Oryx.") });
      setMessage({ ok: true, text: enabled ? "Published to Property Oryx. It appears in your feed now." : "Removed from Property Oryx." });
      await load();
    } finally {
      setPublishing(false);
    }
  }

  async function saveAndPublish() {
    setConfirming(false);
    if (dirty && !(await save())) return;
    await setPublished(true);
  }

  if (denied)
    return (
      <div className="px-4 py-20 text-center text-muted">
        <p>{denied}</p>
        <Link href={`/property/${id}`} className="font-medium" style={{ color: "var(--primary)" }}>
          Back to the listing
        </Link>
      </div>
    );
  if (!listing || !form || !review)
    return (
      <div className="px-4 pt-10 lg:px-0">
        <div className="h-8 w-56 animate-pulse rounded bg-surface-muted" />
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="h-96 animate-pulse rounded-2xl bg-surface-muted" />
          <div className="h-96 animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </div>
    );

  const rent = listing.listingType === "RENT";
  const residential = isResidentialCategory(listing.propertyCategory);
  const errors = review.problems.filter((p) => p.level === "error");
  const warnings = review.problems.filter((p) => p.level === "warning");
  const notes = review.problems.filter((p) => p.level === "info");
  const field = (label: string) => review.fields.find((f) => f.label === label);
  const amenityOptions = listing.propertyCategory === "LAND" ? [] : amenityOptionsFor(listing.propertyCategory);

  const steps = [
    { id: "oryx-basics", label: "Basics", hint: "Price, size, rooms" },
    { id: "oryx-text", label: "Title and description", hint: "What buyers read first" },
    { id: "oryx-location", label: "Location", hint: "City, community, map pin" },
    { id: "oryx-photos", label: "Photos", hint: `Up to ${ORYX_MAX_PHOTOS}` },
    { id: "oryx-agent", label: "Agent", hint: "Contact details" },
  ].map((st) => {
    const mine = review.problems.filter((p) => (SECTION_OF[p.field] ?? "oryx-basics") === st.id);
    const status: "error" | "warning" | "ok" = mine.some((p) => p.level === "error") ? "error" : mine.some((p) => p.level === "warning") ? "warning" : "ok";
    return { ...st, status, first: mine.find((p) => p.level !== "info")?.message };
  });
  const doneCount = steps.filter((st) => st.status !== "error").length;
  const photos = listing.images.slice(0, ORYX_MAX_PHOTOS).map((i) => i.url);
  const priceNum = Number(form.price) || 0;
  const location = [field("Community")?.value, field("City")?.value].filter((v) => v && v !== "—").join(", ");
  const facts = [
    residential && form.bedrooms ? ((BEDROOM_LABELS as Record<string, string>)[form.bedrooms] ?? form.bedrooms) : null,
    residential && form.bathrooms ? `${form.bathrooms} bath` : null,
    form.sizeSqm ? `${form.sizeSqm} sqm` : null,
    form.furnished === "FURNISHED" ? "Furnished" : "Unfurnished",
  ].filter(Boolean) as string[];
  const primaryLabel = saving ? "Saving…" : publishing ? "Publishing…" : dirty ? "Save and publish" : errors.length ? "Fix the items above to publish" : "Publish to Property Oryx";
  const primaryDisabled = publishing || saving || (!dirty && errors.length > 0);

  return (
    <div className="px-4 pb-40 pt-4 lg:px-0 lg:pb-16 lg:pt-8 page-in" id="oryx-top">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <Link href={`/property/${id}`} className="font-medium hover:text-slate-900">
          ← Listing
        </Link>
        <span className="text-slate-300">/</span>
        <Link href={`/property/${id}/portals`} className="hover:text-slate-900">
          Portals
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-medium tracking-[-0.02em] lg:text-[30px]">Publish to Property Oryx</h1>
          <p className="mt-1 text-[14px] text-muted">
            <span className="font-medium text-foreground">{listing.buildingName}</span> · Ref {field("Reference number")?.value}. Review the details, check the preview, then publish.
          </p>
        </div>
        <span className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${review.enabled ? "bg-success-bg" : "bg-surface-muted text-muted"}`} style={review.enabled ? { color: "var(--success)" } : undefined}>
          {review.enabled ? "● Live on Property Oryx" : "Not published"}
        </span>
      </div>

      {message && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-[14px] ${message.ok ? "bg-success-bg" : "bg-danger-bg text-danger"}`} style={message.ok ? { color: "var(--success)" } : undefined}>
          {message.text}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
        {/* ------------------------------------------------------------- left: the details, editable */}
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:order-1">
          <section id="oryx-basics" className={card}>
            <h2 className="mb-4 text-[16px] font-medium">Basics</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className={labelCls}>Offering</span>
                <div className="rounded-xl bg-surface-muted px-3.5 py-3 text-[15px]">
                  {field("Offering")?.value} <span className="ml-1 rounded bg-white px-1.5 py-0.5 font-mono text-[12px] text-slate-600">{field("Offering")?.sent}</span>
                </div>
              </div>
              <div>
                <span className={labelCls}>Property type</span>
                <div className="rounded-xl bg-surface-muted px-3.5 py-3 text-[15px]">
                  {field("Property type")?.value} <span className="ml-1 rounded bg-white px-1.5 py-0.5 font-mono text-[12px] text-slate-600">{field("Property type")?.sent}</span>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="oryx-price">
                  {rent ? "Rent per month (QAR)" : "Price (QAR)"}
                </label>
                <input id="oryx-price" type="number" inputMode="numeric" min="1" value={form.price} onChange={(e) => set("price", e.target.value)} className={inputCls} />
                <p className={hint}>Whole numbers only. No commas.</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="oryx-size">
                  Size (sqm)
                </label>
                <input id="oryx-size" type="number" inputMode="decimal" min="1" value={form.sizeSqm} onChange={(e) => set("sizeSqm", e.target.value)} className={inputCls} />
                <p className={hint}>Sent as a whole number.</p>
              </div>
              {residential && (
                <>
                  <div>
                    <label className={labelCls} htmlFor="oryx-beds">
                      Bedrooms
                    </label>
                    <select id="oryx-beds" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} className={inputCls}>
                      <option value="">Select…</option>
                      {bedroomOptionsFor(listing.propertyCategory).map((b) => (
                        <option key={b} value={b}>
                          {BEDROOM_LABELS[b]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="oryx-baths">
                      Bathrooms
                    </label>
                    <input id="oryx-baths" type="number" inputMode="numeric" min="0" max="20" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} className={inputCls} />
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <span className={labelCls}>Furnished</span>
                <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
                  {(["FURNISHED", "UNFURNISHED"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => set("furnished", v)} aria-pressed={form.furnished === v} className={`flex-1 rounded-lg py-2.5 text-[14px] font-medium ${form.furnished === v ? "bg-surface shadow-sm" : "text-muted"}`} style={form.furnished === v ? { color: "var(--primary)" } : undefined}>
                      {v === "FURNISHED" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="oryx-text" className={card}>
            <h2 className="mb-4 text-[16px] font-medium">Title and description</h2>
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <label className={labelCls} htmlFor="oryx-title">
                    Title (English) <span className="text-danger">*</span>
                  </label>
                  <Counter value={form.title} max={80} />
                </div>
                <input id="oryx-title" value={form.title} maxLength={80} onChange={(e) => set("title", e.target.value)} className={inputCls} placeholder="e.g. Furnished 2BR with marina view" />
                <p className={hint}>Up to 80 characters. Short and descriptive. Don&apos;t write it all in capitals. No emojis. Property Finder keeps its own 50-character title.</p>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className={labelCls} htmlFor="oryx-title-ar">
                    Title (Arabic) <span className="font-normal text-muted">optional</span>
                  </label>
                  <Counter value={form.titleAr} max={50} />
                </div>
                <input id="oryx-title-ar" dir="rtl" value={form.titleAr} maxLength={50} onChange={(e) => set("titleAr", e.target.value)} className={inputCls} />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className={labelCls} htmlFor="oryx-desc">
                    Description (English) <span className="text-danger">*</span>
                  </label>
                  <Counter value={form.description} max={2000} />
                </div>
                <textarea id="oryx-desc" rows={6} value={form.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} className={`${inputCls} resize-y`} />
                <p className={hint}>Well written and descriptive. Mention the view, the building and what&apos;s nearby.</p>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className={labelCls} htmlFor="oryx-desc-ar">
                    Description (Arabic) <span className="font-normal text-muted">optional</span>
                  </label>
                  <Counter value={form.descriptionAr} max={2000} />
                </div>
                <textarea id="oryx-desc-ar" dir="rtl" rows={4} value={form.descriptionAr} maxLength={2000} onChange={(e) => set("descriptionAr", e.target.value)} className={`${inputCls} resize-y`} />
              </div>
            </div>
          </section>

          <section id="oryx-location" className={card}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-medium">Location</h2>
              <Link href={`/property/${id}?edit=1`} className="text-[13px] font-medium" style={{ color: "var(--primary)" }}>
                Change location
              </Link>
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
              {["City", "Community", "Sub-community", "Map pin"].map((l) => (
                <div key={l}>
                  <dt className="text-[12.5px] text-muted">{l}</dt>
                  <dd className="mt-0.5">{field(l)?.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4">
              <label className={labelCls} htmlFor="oryx-building">
                Property name <span className="font-normal text-muted">(the tower or project)</span>
              </label>
              <input id="oryx-building" value={form.buildingName} onChange={(e) => set("buildingName", e.target.value)} className={inputCls} />
            </div>
          </section>

          {amenityOptions.length > 0 && (
            <section id="oryx-amenities" className={card}>
              <h2 className="mb-1 text-[16px] font-medium">Amenities</h2>
              <p className="mb-3 text-[12.5px] text-muted">The code in each tag is what Oryx receives. A struck-through name has no Oryx code, so it isn&apos;t sent.</p>
              <div className="flex flex-wrap gap-2">
                {amenityOptions.map((o) => {
                  const on = form.amenities.includes(o.value);
                  const code = ORYX_AMENITY_CODES[o.value];
                  return (
                    <button key={o.value} type="button" aria-pressed={on} onClick={() => set("amenities", on ? form.amenities.filter((x) => x !== o.value) : [...form.amenities, o.value])} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] ${on ? "border-primary bg-accent-light text-primary" : "border-border text-slate-600"} ${code ? "" : "opacity-70"}`}>
                      <span className={on && !code ? "line-through" : ""}>{AMENITY_LABELS[o.value] ?? o.label}</span>
                      {code && <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{code}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section id="oryx-photos" className={card}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-medium">Photos</h2>
              <Link href={`/property/${id}?edit=1`} className="text-[13px] font-medium" style={{ color: "var(--primary)" }}>
                Manage photos
              </Link>
            </div>
            <p className="mb-3 text-[12.5px] text-muted">Oryx takes up to {ORYX_MAX_PHOTOS} photos. The first photo is the cover.</p>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {listing.images.map((img, i) => (
                <div key={img.id} className={`relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-muted ${i >= ORYX_MAX_PHOTOS ? "opacity-40" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-[rgba(13,31,92,0.6)] px-1.5 py-0.5 text-[11px] font-medium text-white">{i < ORYX_MAX_PHOTOS ? i + 1 : "not sent"}</span>
                </div>
              ))}
              {listing.images.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted">No photos yet.</p>}
            </div>
          </section>

          <section id="oryx-agent" className={card}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-medium">Agent</h2>
              <Link href="/settings" className="text-[13px] font-medium" style={{ color: "var(--primary)" }}>
                Edit in Settings
              </Link>
            </div>
            <p className="text-[14px]">{field("Agent")?.value}</p>
            <p className={hint}>The listing&apos;s agent is shown to Oryx with their phone number including the country code.</p>
          </section>
        </div>

        {/* ------------------------------------------------------------- right: readiness, publish, preview */}
        <div className="order-1 flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:order-2">
          <section className={card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-medium">{errors.length ? "Not ready yet" : warnings.length ? "Ready, with a few things to check" : review.enabled ? "Live and up to date" : "Ready to publish"}</h2>
                <p className="mt-0.5 text-[13px] text-muted">{errors.length ? `${errors.length} thing${errors.length === 1 ? "" : "s"} to fix first.` : dirty ? "You have unsaved changes. They are saved when you publish." : review.enabled ? "This listing is in your Oryx feed." : "Everything Oryx needs is here."}</p>
              </div>
              <span className="tnum shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-[12px] font-medium text-slate-600">
                {doneCount}/{steps.length}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(doneCount / steps.length) * 100}%`, background: errors.length ? "var(--primary)" : "var(--success)" }} />
            </div>

            <ul className="mt-3 flex flex-col">
              {steps.map((st) => (
                <li key={st.id}>
                  <button type="button" onClick={() => document.getElementById(st.id)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-muted">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${st.status === "error" ? "bg-rose-100 text-rose-600" : st.status === "warning" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-600"}`}>{st.status === "error" ? "!" : st.status === "warning" ? "•" : "✓"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{st.label}</span>
                      <span className={`block truncate text-[12.5px] ${st.status === "ok" ? "text-muted" : st.status === "error" ? "text-danger" : "text-amber-700"}`}>{st.first ?? st.hint}</span>
                    </span>
                    <span className="text-slate-300" aria-hidden>›</span>
                  </button>
                </li>
              ))}
            </ul>

            {notes.length > 0 && (
              <details className="mt-2 rounded-lg px-2 py-1.5 text-[13px] text-muted">
                <summary className="cursor-pointer">Good to know ({notes.length})</summary>
                <ul className="mt-1.5 flex flex-col gap-1.5 pl-1">
                  {notes.map((p, i) => (
                    <li key={i}>• {p.message}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {review.enabled ? (
                <>
                  {dirty && (
                    <button type="button" disabled={saving} onClick={save} className="h-12 w-full rounded-xl text-[14.5px] font-medium text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  )}
                  <button type="button" disabled={publishing} onClick={() => setPublished(false)} className="h-11 w-full rounded-xl bg-danger-bg text-[14px] font-medium text-danger disabled:opacity-60">
                    {publishing ? "Updating…" : "Remove from Property Oryx"}
                  </button>
                </>
              ) : (
                <button type="button" disabled={primaryDisabled} onClick={() => setConfirming(true)} className="h-12 w-full rounded-xl text-[14.5px] font-medium text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
                  {primaryLabel}
                </button>
              )}
            </div>
          </section>

          <section className={card}>
            <div className="mb-3 flex gap-1 rounded-xl bg-surface-muted p-1">
              {([["preview", "Preview"], ["summary", "Data sent"], ["xml", "XML"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`flex-1 rounded-lg py-2 text-[13.5px] font-medium ${view === v ? "bg-surface shadow-sm" : "text-muted"}`} style={view === v ? { color: "var(--primary)" } : undefined}>
                  {l}
                </button>
              ))}
            </div>

            {view === "preview" && (
              <div>
                <p className="mb-2 text-[12px] text-muted">How the listing reads on Property Oryx. Updates as you type.</p>
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="relative aspect-[4/3] bg-surface-muted">
                    {photos.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photos[Math.min(photo, photos.length - 1)]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[13px] text-muted">No photos yet</div>
                    )}
                    {photos.length > 1 && (
                      <span className="absolute bottom-2 right-2 rounded-full bg-[rgba(13,31,92,0.6)] px-2.5 py-1 text-[11px] font-medium text-white">
                        {Math.min(photo, photos.length - 1) + 1} / {photos.length}
                      </span>
                    )}
                  </div>
                  {photos.length > 1 && (
                    <div className="no-scrollbar flex gap-1.5 overflow-x-auto p-2">
                      {photos.map((u, i) => (
                        <button key={u + i} type="button" onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} className={`h-11 w-14 shrink-0 overflow-hidden rounded-md ring-2 ${i === photo ? "ring-primary" : "ring-transparent"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="p-4">
                    <div className="text-[20px] font-bold">
                      {priceNum ? formatQAR(priceNum) : "Price not set"}
                      {rent && priceNum > 0 && <span className="text-[13px] font-medium text-muted"> / month</span>}
                    </div>
                    <h3 className="mt-1 text-[16px] font-semibold leading-snug">{form.title || <span className="font-normal text-muted">Add a title</span>}</h3>
                    {location && <p className="mt-1 text-[13px] text-muted">{location}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {facts.map((f) => (
                        <span key={f} className="rounded-full bg-surface-muted px-2.5 py-1 text-[12px] text-slate-600">
                          {f}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 line-clamp-6 whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">{form.description || <span className="text-muted">Add a description</span>}</p>
                    {form.amenities.some((a) => ORYX_AMENITY_CODES[a]) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {form.amenities.filter((a) => ORYX_AMENITY_CODES[a]).map((a) => (
                          <span key={a} className="rounded-full bg-accent-light px-2.5 py-1 text-[12px] text-primary">
                            {AMENITY_LABELS[a] ?? a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {view === "summary" && (
              <dl className="divide-y divide-border text-[13.5px]">
                {review.fields.map((f) => (
                  <div key={f.label} className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="shrink-0 text-muted">{f.label}</dt>
                    <dd className="min-w-0 text-right">
                      <span className="break-words">{f.value}</span>
                      {f.sent && f.sent !== f.value && <span className="ml-2 inline-block rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11.5px] text-slate-600">{f.sent}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {view === "xml" && (
              <>
                <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-900 p-3.5 text-[11.5px] leading-relaxed text-slate-100">{review.xml ?? "Nothing to show yet. Fix the items above first."}</pre>
                {review.xml && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(review.xml!).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      });
                    }}
                    className="mt-3 rounded-lg bg-surface-muted px-3.5 py-2 text-[13px] font-medium hover:bg-border"
                  >
                    {copied ? "Copied" : "Copy XML"}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4 lg:bottom-6 lg:left-64 lg:right-0 lg:px-8">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl">
            <span className="text-[14px]">Unsaved changes</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => saved && setForm(saved)} className="rounded-lg px-3.5 py-2 text-[13.5px] hover:bg-white/10">
                Discard
              </button>
              <button type="button" disabled={saving || publishing} onClick={save} className="rounded-lg bg-white px-4 py-2 text-[13.5px] font-medium text-slate-900 disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label="Confirm publish">
          <div className="absolute inset-0 bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onClick={() => setConfirming(false)} />
          <div className="relative w-full max-w-md rounded-t-3xl bg-background p-6 lg:rounded-3xl">
            <h2 className="text-[18px] font-semibold">Publish to Property Oryx?</h2>
            <p className="mt-2 text-[14px] text-muted">
              <span className="font-medium text-foreground">{form.title || listing.buildingName}</span> will be added to your Oryx feed{dirty ? ", and your unsaved changes will be saved first" : ""}. You can remove it at any time.
            </p>
            {warnings.length > 0 && (
              <ul className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                {warnings.map((p, i) => (
                  <li key={i}>• {p.message}</li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="h-12 flex-1 rounded-xl bg-surface-muted text-[14.5px] font-medium">
                Cancel
              </button>
              <button type="button" onClick={saveAndPublish} className="h-12 flex-1 rounded-xl text-[14.5px] font-medium text-white" style={{ background: "var(--primary)" }}>
                Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
