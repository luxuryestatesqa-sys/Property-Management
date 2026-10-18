"use client";

import { useState } from "react";
import { PropertyCategory, BedroomCount } from "@/lib/types";
import { pfLayoutNote } from "@/lib/propertyFinder/mapping";
import { PROPERTY_CATEGORY_LABELS, PROPERTY_CATEGORY_OPTIONS, BEDROOM_LABELS, isResidentialCategory, bedroomOptionsFor, unitLabelFor } from "@/lib/propertyCategory";
import { amenityOptionsFor } from "@/lib/propertyFinder/mapping";
import SegmentedControl from "../SegmentedControl";
import VisibilityField from "../VisibilityField";
import UnitDetailsPrivacyField from "../UnitDetailsPrivacyField";
import LocationAutocomplete from "../LocationAutocomplete";
import PfLocationPicker from "./PfLocationPicker";
import PhotoPicker from "../PhotoPicker";
import MultiChipSelect from "../MultiChipSelect";
import AiWriteButton from "../AiWriteButton";
import PrivateDetailsSection from "../PrivateDetailsSection";
import AddPropertyAside, { AddAsideData } from "./AddPropertyAside";
import { IconChevronRight } from "./icons";
import type { AddForm } from "./addFormTypes";
import SaleDetailsFields, { saleDetailsProblem } from "../SaleDetailsFields";

interface Props {
  form: AddForm;
  setForm: React.Dispatch<React.SetStateAction<AddForm>>;
  update: <K extends keyof AddForm>(key: K, value: AddForm[K]) => void;
  aside: AddAsideData;
  error: string;
  submitting: boolean;
  aiBusy: "title" | "description" | null;
  aiError: string;
  generateWithAi: (field: "title" | "description") => void;
  onSubmit: () => void;
}

const input = "w-full rounded-xl border border-border bg-white px-4 py-3.5 text-[15px] outline-none";
// Keeps what is typed to a plain positive number: no minus sign, "e", or letters.
const positive = (v: string, decimals = false) => {
  const cleaned = v.replace(decimals ? /[^\d.]/g : /\D/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
};
const isPositive = (v: string) => Number(v) > 0;
const fieldLabel = "mb-2 block text-[13.5px] font-semibold text-slate-700";

// A native select (best on phones too) styled like the other fields, with our own chevron.
function Dropdown({ id, value, onChange, placeholder, children }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${input} cursor-pointer appearance-none pr-11 font-medium ${value ? "text-foreground" : "text-muted"}`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

function MoneyInput({ value, onChange, suffix, placeholder, big }: { value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string; big?: boolean }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-white px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-light">
      <span className="mr-2 text-[14px] font-medium text-muted">QAR</span>
      <input
        data-bare
        type="number"
        inputMode="numeric"
        min="1"
        value={value}
        onKeyDown={(e) => ["-", "+", "e", "E"].includes(e.key) && e.preventDefault()}
        onChange={(e) => onChange(positive(e.target.value))}
        placeholder={placeholder}
        className={`tnum min-w-0 flex-1 bg-transparent outline-none ${big ? "py-4 text-[26px] font-semibold tracking-tight" : "py-3.5 text-[15px]"}`}
      />
      {suffix && <span className="text-[13px] text-muted">{suffix}</span>}
    </div>
  );
}

// One-tap shortcuts under a number field (typing a different value still works).
function QuickPick({ values, current, onPick, format }: { values: number[]; current: string; onPick: (v: string) => void; format: (n: number) => string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-muted">Quick pick:</span>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(String(v))}
          className={`tnum rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            current === String(v) ? "border-primary bg-accent-light text-primary" : "border-border bg-surface text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}

const RENT_QUICK = [3000, 5000, 7000, 10000, 15000, 20000];
const SALE_QUICK = [500000, 1000000, 1500000, 2500000, 4000000, 6000000];
const SIZE_QUICK = [50, 80, 120, 180, 250];
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}K` : String(n));

// A numbered card. When the agent tries to add the listing with this part
// unfinished, the card gets a red edge and says exactly what is missing.
function Section({ id, n, title, hint, problem, badge, children }: { id: string; n: number; title: string; hint?: string; problem: string | null; badge?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`surface-card scroll-mt-6 p-7 transition-shadow ${problem ? "ring-2 ring-red-300" : ""}`}>
      <div className="mb-5 flex items-start gap-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white">{n}</span>
        <div>
          <h2 className="flex items-center gap-2.5 text-[19px] font-semibold tracking-[-0.02em]">
            {title}
            {badge && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-wide text-amber-800">{badge}</span>}
          </h2>
          {hint && <p className="mt-0.5 text-[13.5px] text-muted">{hint}</p>}
        </div>
      </div>
      {children}
      {problem && <p className="mt-4 rounded-lg bg-danger-bg px-3.5 py-2.5 text-[13.5px] font-medium text-danger">{problem}</p>}
    </section>
  );
}

// Optional extras live in collapsed rows so the form stays short.
function Extra({ title, summary, children, defaultOpen }: { title: string; summary: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50">
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold">{title}</div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted">{summary}</div>
        </div>
        <IconChevronRight size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="border-t border-slate-100 p-5">{children}</div>}
    </div>
  );
}

export default function AddPropertySimple({ form, setForm, update, aside, error, submitting, aiBusy, aiError, generateWithAi, onSubmit }: Props) {
  const [showErrors, setShowErrors] = useState(false);

  const category = form.propertyCategory as PropertyCategory | "";
  const unit = category ? unitLabelFor(category) : null;
  const residential = category ? isResidentialCategory(category) : false;
  const isRent = form.listingType === "RENT";
  const amenityOptions = category && category !== "LAND" ? amenityOptionsFor(category) : [];

  // What is still missing in each numbered section (same rules the server checks).
  const problems: Record<string, string | null> = {
    "sec-type": !category ? "Choose a property type" : residential && !form.bedrooms ? "Choose the number of bedrooms" : !isPositive(form.sizeSqm) ? "Enter the size in sqm" : Number(form.sizeSqm) < 10 ? "Size must be at least 10 sqm" : null,
    "sec-price": isRent ? (isPositive(form.rentPrice) ? null : "Enter the monthly rent") : isPositive(form.salePrice) ? saleDetailsProblem(form) : "Enter the sale price",
    "sec-photos": form.images.length === 0 ? "Add at least one photo" : null,
    "sec-where": !form.area.trim() || !form.community.trim()
      ? "Choose the location"
      : null, // building name, floor and unit number are optional
  };
  const order = ["sec-type", "sec-price", "sec-photos", "sec-where"];
  const firstMissing = order.find((k) => problems[k]);

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function add() {
    if (firstMissing) {
      setShowErrors(true);
      jump(firstMissing);
      return;
    }
    onSubmit();
  }

  const shown = (id: string) => (showErrors ? problems[id] : null);

  return (
    <div className="page-in">
      <div className="px-4 pb-5 pt-4 lg:px-0 lg:pb-7 lg:pt-10">
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Add Property</h1>
        <p className="mt-2.5 text-[15px] text-muted">Sections 1 to 4 are required. Add a title and description (section 5) too: Property Finder needs them to publish.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 px-4 pb-8 md:px-0 min-[1040px]:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="flex flex-col gap-6">
          {/* 1 ----------------------------------------------------------- */}
          <Section id="sec-type" n={1} title="Property type" problem={shown("sec-type")}>
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3">
                {([["RENT", "For Rent"], ["SALE", "For Sale"]] as const).map(([v, t]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => update("listingType", v)}
                    aria-pressed={form.listingType === v}
                    className={`rounded-xl border py-3.5 text-[15px] font-semibold transition-all ${form.listingType === v ? "border-primary bg-accent-light text-primary shadow-sm ring-1 ring-primary/20" : "border-border bg-surface text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className={`grid grid-cols-1 gap-5 ${residential && category ? "sm:grid-cols-2" : ""}`}>
                <div>
                  <label htmlFor="add-category" className={fieldLabel}>Property type</label>
                  <Dropdown
                    id="add-category"
                    value={category}
                    placeholder="Select property type"
                    onChange={(v) =>
                      setForm((prev) => {
                        const c = v as PropertyCategory;
                        const stillValid = isResidentialCategory(c) && bedroomOptionsFor(c).includes(prev.bedrooms as BedroomCount);
                        return { ...prev, propertyCategory: c, bedrooms: stillValid ? prev.bedrooms : "", amenities: c === "LAND" ? [] : prev.amenities };
                      })
                    }
                  >
                    {PROPERTY_CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {PROPERTY_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </Dropdown>
                </div>

                {residential && category && (
                  <div>
                    <label htmlFor="add-bedrooms" className={fieldLabel}>Bedrooms</label>
                    <Dropdown id="add-bedrooms" value={form.bedrooms} placeholder="Select bedrooms" onChange={(v) => update("bedrooms", v as BedroomCount)}>
                      {bedroomOptionsFor(category).map((b) => (
                        <option key={b} value={b}>
                          {BEDROOM_LABELS[b]}
                        </option>
                      ))}
                    </Dropdown>
                    {pfLayoutNote(form.bedrooms as BedroomCount) && <p className="mt-1.5 text-[12px] text-muted">{pfLayoutNote(form.bedrooms as BedroomCount)}</p>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className={fieldLabel}>Size</label>
                  <div className="flex items-center rounded-xl border border-border bg-white px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-light">
                    <input data-bare type="number" inputMode="decimal" min="10" value={form.sizeSqm} onKeyDown={(e) => ["-", "+", "e", "E"].includes(e.key) && e.preventDefault()} onChange={(e) => update("sizeSqm", positive(e.target.value, true))} placeholder="e.g. 120" className="min-w-0 flex-1 bg-transparent py-3.5 text-[15px] outline-none" />
                    <span className="text-[13px] text-muted">sqm</span>
                  </div>
                  <QuickPick values={SIZE_QUICK} current={form.sizeSqm} onPick={(v) => update("sizeSqm", v)} format={(n) => `${n}`} />
                </div>
                {category && category !== "LAND" && (
                  <div>
                    <label className={fieldLabel}>
                      Bathrooms <span className="font-normal text-muted">(optional)</span>
                    </label>
                    <input type="number" inputMode="numeric" min="0" max="20" value={form.bathrooms} onKeyDown={(e) => ["-", "+", "e", "E", "."].includes(e.key) && e.preventDefault()} onChange={(e) => update("bathrooms", positive(e.target.value).slice(0, 2))} placeholder="e.g. 2" className={input} />
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* 2 ----------------------------------------------------------- */}
          <Section id="sec-price" n={2} title={isRent ? "Rent price" : "Sale price"} problem={shown("sec-price")}>
            {isRent ? (
              <div>
                <MoneyInput big value={form.rentPrice} onChange={(v) => update("rentPrice", v)} suffix="/ month" placeholder="Enter amount" />
                <QuickPick values={RENT_QUICK} current={form.rentPrice} onPick={(v) => update("rentPrice", v)} format={short} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={fieldLabel}>Price</label>
                  <MoneyInput big value={form.salePrice} onChange={(v) => update("salePrice", v)} placeholder="Enter amount" />
                  <QuickPick values={SALE_QUICK} current={form.salePrice} onPick={(v) => update("salePrice", v)} format={short} />
                </div>
                <div>
                  <label className={fieldLabel}>
                    Rental value <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <MoneyInput value={form.rentalValue} onChange={(v) => update("rentalValue", v)} suffix="/ month" placeholder="e.g. 10,000" />
                </div>
                <div className="col-span-2 border-t border-slate-100 pt-5">
                  <SaleDetailsFields value={form} onChange={(patch) => (Object.keys(patch) as (keyof typeof patch)[]).forEach((k) => update(k, patch[k] as never))} showErrors={Boolean(shown("sec-price"))} />
                </div>
              </div>
            )}
          </Section>

          {/* 3 ----------------------------------------------------------- */}
          <Section id="sec-photos" n={3} title="Photos" hint="The first photo is the cover. Drag to reorder." problem={shown("sec-photos")}>
            <PhotoPicker images={form.images} onChange={(images) => update("images", images)} />
          </Section>

          {/* 4 ----------------------------------------------------------- */}
          <Section id="sec-where" n={4} title="Location" hint="Floor and unit number stay private unless you choose otherwise." problem={shown("sec-where")}>
            <div className="flex flex-col gap-5">
              <PfLocationPicker
                area={form.area}
                community={form.community}
                pfLocationId={form.pfLocationId}
                label={form.pfLocationLabel}
                onChange={(v) => setForm((prev) => ({ ...prev, area: v.area, community: v.community, pfLocationId: v.pfLocationId, pfLocationLabel: v.label }))}
              />
              <LocationAutocomplete label={<>Building name <span className="font-normal text-muted">(optional)</span></>} placeholder="e.g. Marina Tower 5" area={form.area} community={form.community} value={form.buildingName} onChange={(v) => update("buildingName", v)} />
              <div className="grid grid-cols-2 gap-5">
                {unit?.showFloor && (
                  <div>
                    <label className={fieldLabel}>Floor <span className="font-normal text-muted">(optional)</span></label>
                    <input type="text" inputMode="numeric" value={form.floor} onChange={(e) => update("floor", e.target.value)} placeholder="e.g. 12" className={input} />
                  </div>
                )}
                <div className={unit?.showFloor ? "" : "col-span-2"}>
                  <label className={fieldLabel}>
                    {unit?.unitLabel ?? "Apartment No."} <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input type="text" value={form.apartmentNumber} onChange={(e) => update("apartmentNumber", e.target.value)} placeholder={`e.g. ${unit?.unitPlaceholder ?? "1204"}`} className={input} />
                </div>
              </div>
              <UnitDetailsPrivacyField value={form.unitDetailsPrivate} onChange={(v) => update("unitDetailsPrivate", v)} unitLabel={unit?.unitLabel ?? "Apartment No."} showFloor={Boolean(unit?.showFloor)} />
            </div>
          </Section>

          {/* 5 ----------------------------------------------------------- */}
          <Section id="sec-text" n={5} title="Title and description" badge="Important" hint="A clear title and description get more enquiries, and Property Finder needs them to publish." problem={null}>
            <div className="flex flex-col gap-6">
              {aiError && <div className="rounded-xl bg-danger-bg px-3 py-2.5 text-[13px] text-danger">{aiError}</div>}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[13.5px] font-semibold text-slate-700">Title</span>
                      <AiWriteButton onClick={() => generateWithAi("title")} busy={aiBusy === "title"} disabled={aiBusy !== null} />
                    </div>
                    <input type="text" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Spacious 2BR with Marina View" maxLength={80} className={input} />
                    <div className={`mt-1 text-right text-[12px] ${form.title.length >= 75 ? "font-semibold text-danger" : "text-muted"}`}>{form.title.length >= 80 ? "Limit reached · " : ""}{form.title.length}/80</div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[13.5px] font-semibold text-slate-700">Description</span>
                      <AiWriteButton onClick={() => generateWithAi("description")} busy={aiBusy === "description"} disabled={aiBusy !== null} />
                    </div>
                    <textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Describe the property…" rows={7} maxLength={2000} className={`${input} resize-none`} />
                    <div className="mt-1 text-right text-[12px] text-muted">{form.description.length}/2000</div>
                  </div>
            </div>
          </Section>

          {/* Optional --------------------------------------------------- */}
          <div>
            <h3 className="mb-3 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">Optional details</h3>
            <div className="flex flex-col gap-3">
              <Extra
                title="Features and amenities"
                summary={[category !== "LAND" ? (form.furnished === "FURNISHED" ? "Furnished" : "Unfurnished") : null, `${form.amenities.length} amenit${form.amenities.length === 1 ? "y" : "ies"}`].filter(Boolean).join(" · ")}
              >
                <div className="flex flex-col gap-6">
                  {category !== "LAND" && (
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <span className={fieldLabel}>Furnishing</span>
                        <SegmentedControl options={[{ label: "Furnished", value: "FURNISHED" }, { label: "Unfurnished", value: "UNFURNISHED" }]} value={form.furnished} onChange={(v) => update("furnished", v)} />
                      </div>
                      {isRent && (
                        <div>
                          <span className={fieldLabel}>Bills</span>
                          <SegmentedControl options={[{ label: "Included", value: "INCLUDED" }, { label: "Excluded", value: "EXCLUDED" }]} value={form.billsStatus} onChange={(v) => update("billsStatus", v)} />
                        </div>
                      )}
                    </div>
                  )}
                  {amenityOptions.length > 0 && (
                    <div>
                      <span className={fieldLabel}>Amenities</span>
                      <MultiChipSelect options={amenityOptions} value={form.amenities} onChange={(v) => update("amenities", v)} />
                    </div>
                  )}
                </div>
              </Extra>

              <Extra title="Who can see this listing" summary={form.visibility === "SHARED" ? "Shared with everyone in the company" : "Only you and admins"}>
                <VisibilityField value={form.visibility} onChange={(v) => update("visibility", v)} />
              </Extra>

              <Extra title="Owner details (private)" summary="Owner name, phone, documents and notes. Only you and admins see these.">
                <PrivateDetailsSection value={form.privateDetails} onChange={(privateDetails) => update("privateDetails", privateDetails)} listingType={form.listingType} />
              </Extra>
            </div>
          </div>

          {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}
        </div>

        <AddPropertyAside data={aside} submitting={submitting} error="" onSubmit={add} onJump={jump} />
      </div>
    </div>
  );
}
