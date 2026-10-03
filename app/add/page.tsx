"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SegmentedControl from "@/components/SegmentedControl";
import CollapsibleChipSelect from "@/components/CollapsibleChipSelect";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import LocationCombinedInput from "@/components/LocationCombinedInput";
import DuplicateWarningModal from "@/components/DuplicateWarningModal";
import PhotoPicker from "@/components/PhotoPicker";
import MultiChipSelect from "@/components/MultiChipSelect";
import AiWriteButton from "@/components/AiWriteButton";
import FormSectionHeader from "@/components/FormSectionHeader";
import PrivateDetailsSection, { EMPTY_PRIVATE_DETAILS, PrivateDetailsValue } from "@/components/PrivateDetailsSection";
import { ListingDTO, PropertyCategory, BedroomCount } from "@/lib/types";
import {
  PROPERTY_CATEGORY_LABELS,
  PROPERTY_CATEGORY_OPTIONS,
  BEDROOM_LABELS,
  isResidentialCategory,
  bedroomOptionsFor,
  unitLabelFor,
  NO_FLOOR_VALUE,
} from "@/lib/propertyCategory";
import { amenityOptionsFor, bathroomsFromInputValue } from "@/lib/propertyFinder/mapping";
import { extractErrorMessage } from "@/lib/errors";

type ListingType = "RENT" | "SALE";

const PROPERTY_TYPE_OPTIONS = PROPERTY_CATEGORY_OPTIONS.map((c) => ({ label: PROPERTY_CATEGORY_LABELS[c], value: c }));

const initialState = {
  listingType: "RENT" as ListingType,
  propertyCategory: "" as PropertyCategory | "",
  bedrooms: "" as BedroomCount | "",
  bathrooms: "" as string,
  sizeSqm: "",
  title: "",
  description: "",
  amenities: [] as string[],
  rentPrice: "",
  salePrice: "",
  rentalValue: "",
  furnished: "FURNISHED" as "FURNISHED" | "UNFURNISHED",
  billsStatus: "INCLUDED" as "INCLUDED" | "EXCLUDED",
  area: "",
  community: "",
  buildingName: "",
  floor: "",
  apartmentNumber: "",
  images: [] as string[],
  privateDetails: EMPTY_PRIVATE_DETAILS as PrivateDetailsValue,
};

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "var(--muted)",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS = {
  basics: (
    <svg {...ICON_PROPS}>
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
    </svg>
  ),
  price: (
    <svg {...ICON_PROPS}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  photos: (
    <svg {...ICON_PROPS}>
      <path d="M3 7h3l2-2h8l2 2h3v13H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  marketing: (
    <svg {...ICON_PROPS}>
      <path d="M4 4h16v12H8l-4 4Z" />
      <path d="M8 9h8M8 12.5h5" />
    </svg>
  ),
  features: (
    <svg {...ICON_PROPS}>
      <path d="m12 3 2.2 4.8L19 9l-4 3.5 1 5.3-4-2.6-4 2.6 1-5.3-4-3.5 4.8-1.2Z" />
    </svg>
  ),
  location: (
    <svg {...ICON_PROPS}>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  ),
};

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">{children}</section>;
}

export default function AddPropertyPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<ListingDTO[] | null>(null);
  const [success, setSuccess] = useState(false);
  const [aiBusy, setAiBusy] = useState<"title" | "description" | null>(null);
  const [aiError, setAiError] = useState("");

  // Writes the title + description from what's already filled in above; the
  // agent can edit the result before saving. Same generator the Publishing
  // Hub uses, run on this unsaved form's values.
  async function generateWithAi(field: "title" | "description") {
    setAiError("");
    if (!form.propertyCategory || !form.area.trim()) {
      setAiError("Choose the property type and location first, so the AI has details to write about");
      return;
    }
    const current = field === "title" ? form.title : form.description;
    if (current.trim() && !window.confirm(`Replace the current ${field} with AI-written text?`)) return;
    setAiBusy(field);
    try {
      const res = await fetch("/api/ai/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          currentTitle: form.title,
          listingType: form.listingType,
          propertyCategory: form.propertyCategory,
          bedrooms: form.bedrooms || null,
          bathrooms: bathroomsFromInputValue(form.bathrooms),
          sizeSqm: form.sizeSqm,
          furnished: form.furnished,
          area: form.area,
          community: form.community,
          amenities: form.amenities,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAiError(extractErrorMessage(data?.error, "Couldn't generate text"));
        return;
      }
      setForm((prev) => ({ ...prev, ...(field === "title" ? { title: data.title } : { description: data.description }) }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setAiBusy(null);
    }
  }

  function update<K extends keyof typeof initialState>(key: K, value: (typeof initialState)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.propertyCategory) return "Property type is required";
    if (isResidentialCategory(form.propertyCategory) && !form.bedrooms) return "Bedrooms is required";
    if (!form.sizeSqm) return "Size is required";
    if (form.images.length === 0) return "At least one photo is required";
    if (!form.area.trim()) return "Location is required";
    if (!form.community.trim()) return "Area / Community is required";
    if (!form.buildingName.trim()) return "Building name is required";
    const unit = unitLabelFor(form.propertyCategory);
    if (unit.showFloor && !form.floor.trim()) return "Floor is required";
    if (!form.apartmentNumber.trim()) return `${unit.unitLabel} is required`;
    if (form.listingType === "RENT" && !form.rentPrice) return "Rent price is required";
    if (form.listingType === "SALE" && !form.salePrice) return "Sale price is required";
    return null;
  }

  async function submit(confirmDuplicate: boolean) {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingType: form.listingType,
          propertyCategory: form.propertyCategory,
          bedrooms: isResidentialCategory(form.propertyCategory as PropertyCategory) ? form.bedrooms : undefined,
          bathrooms: form.propertyCategory !== "LAND" ? bathroomsFromInputValue(form.bathrooms) ?? undefined : undefined,
          sizeSqm: Number(form.sizeSqm),
          title: form.title.trim() || undefined,
          description: form.description.trim() || undefined,
          amenities: form.propertyCategory !== "LAND" && form.amenities.length > 0 ? form.amenities : undefined,
          area: form.area,
          community: form.community,
          buildingName: form.buildingName,
          floor: unitLabelFor(form.propertyCategory as PropertyCategory).showFloor ? form.floor : NO_FLOOR_VALUE,
          apartmentNumber: form.apartmentNumber,
          rentPrice: form.listingType === "RENT" ? Number(form.rentPrice) : undefined,
          salePrice: form.listingType === "SALE" ? Number(form.salePrice) : undefined,
          rentalValue: form.listingType === "SALE" && form.rentalValue ? Number(form.rentalValue) : undefined,
          furnished: form.furnished,
          billsStatus: form.listingType === "RENT" ? form.billsStatus : undefined,
          images: form.images,
          ownerName: form.privateDetails.ownerName || undefined,
          ownerPhone: form.privateDetails.ownerPhone || undefined,
          ownerWhatsapp: form.privateDetails.ownerWhatsapp || undefined,
          titleDeedNumber: form.privateDetails.titleDeedNumber || undefined,
          privateNotes: form.privateDetails.privateNotes || undefined,
          titleDeedImage: form.privateDetails.titleDeedImage || undefined,
          authorizationFormImage: form.privateDetails.authorizationFormImage || undefined,
          confirmDuplicate,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          setError("Session expired. Please log in again.");
          router.push("/login");
          return;
        }
        setError(extractErrorMessage(data?.error, "Something went wrong. Please check the form and try again."));
        return;
      }
      if (data?.duplicate) {
        setDuplicates(data.existing);
        return;
      }
      setDuplicates(null);
      setSuccess(true);
      setTimeout(() => {
        router.push(`/property/${data.listing.id}`);
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-4" style={{ background: "var(--success-bg)" }}>
          ✅
        </div>
        <h2 className="text-lg font-bold">Property Added</h2>
        <p className="text-sm text-muted mt-1">Redirecting to listing details...</p>
      </div>
    );
  }

  const amenityOptions = form.propertyCategory ? amenityOptionsFor(form.propertyCategory) : [];

  return (
    <div className="px-4 pb-8">
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3">
        <h1 className="text-xl font-bold">Add Property</h1>
        <p className="text-sm text-muted mt-0.5">Fill in the details below to create a new listing</p>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <FormSectionHeader icon={ICONS.basics} label="Basics" />
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Listing Type</label>
              <SegmentedControl
                options={[
                  { label: "For Rent", value: "RENT" },
                  { label: "For Sale", value: "SALE" },
                ]}
                value={form.listingType}
                onChange={(v) => update("listingType", v)}
              />
            </div>

            <CollapsibleChipSelect
              label="Property Type"
              placeholder="Select property type"
              options={PROPERTY_TYPE_OPTIONS}
              value={form.propertyCategory}
              onChange={(v) => {
                setForm((prev) => {
                  const stillValid = v !== "" && isResidentialCategory(v) && bedroomOptionsFor(v).includes(prev.bedrooms as BedroomCount);
                  return {
                    ...prev,
                    propertyCategory: v,
                    bedrooms: stillValid ? prev.bedrooms : "",
                    amenities: v === "LAND" ? [] : prev.amenities,
                  };
                });
              }}
            />

            {form.propertyCategory && isResidentialCategory(form.propertyCategory) && (
              <CollapsibleChipSelect
                label="Bedrooms"
                placeholder="Select bedrooms"
                options={bedroomOptionsFor(form.propertyCategory).map((b) => ({ label: BEDROOM_LABELS[b], value: b }))}
                value={form.bedrooms}
                onChange={(v) => update("bedrooms", v)}
              />
            )}

            {form.propertyCategory && form.propertyCategory !== "LAND" && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Bathrooms</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="20"
                  value={form.bathrooms}
                  onChange={(e) => update("bathrooms", e.target.value)}
                  placeholder="2"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Size
              </label>
              <div className="flex items-center rounded-xl border border-border bg-surface px-4 focus-within:border-primary">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={form.sizeSqm}
                  onChange={(e) => update("sizeSqm", e.target.value)}
                  placeholder="120"
                  className="flex-1 min-w-0 py-3.5 outline-none bg-transparent text-base"
                />
                <span className="text-muted text-[13px]">sqm</span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <FormSectionHeader icon={ICONS.price} label="Pricing" />
          <div className="flex flex-col gap-4">
            {form.listingType === "RENT" ? (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Rent Price (per month)</label>
                <div className="flex items-center rounded-xl border border-border bg-surface px-4 focus-within:border-primary">
                  <span className="text-muted text-[15px] mr-1">QAR</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={form.rentPrice}
                    onChange={(e) => update("rentPrice", e.target.value)}
                    placeholder="8,000"
                    className="flex-1 min-w-0 py-3.5 outline-none bg-transparent text-base"
                  />
                  <span className="text-muted text-[13px]">/month</span>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Sale Price</label>
                  <div className="flex items-center rounded-xl border border-border bg-surface px-4 focus-within:border-primary">
                    <span className="text-muted text-[15px] mr-1">QAR</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={form.salePrice}
                      onChange={(e) => update("salePrice", e.target.value)}
                      placeholder="1,850,000"
                      className="flex-1 min-w-0 py-3.5 outline-none bg-transparent text-base"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Rental Value <span className="text-muted font-normal">(optional)</span>
                  </label>
                  <div className="flex items-center rounded-xl border border-border bg-surface px-4 focus-within:border-primary">
                    <span className="text-muted text-[15px] mr-1">QAR</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={form.rentalValue}
                      onChange={(e) => update("rentalValue", e.target.value)}
                      placeholder="10,000"
                      className="flex-1 min-w-0 py-3.5 outline-none bg-transparent text-base"
                    />
                    <span className="text-muted text-[13px]">/month</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <FormSectionHeader icon={ICONS.photos} label="Photos" />
          <PhotoPicker images={form.images} onChange={(images) => update("images", images)} />
        </Card>

        <Card>
          <FormSectionHeader icon={ICONS.marketing} label="Title & Description" badge="(optional, needed to publish to Property Finder)" />
          <div className="flex flex-col gap-3">
            {aiError && <div className="rounded-xl bg-danger-bg text-danger text-[13px] px-3 py-2.5">{aiError}</div>}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">Title</span>
                <AiWriteButton onClick={() => generateWithAi("title")} busy={aiBusy === "title"} disabled={aiBusy !== null} />
              </div>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Listing title, e.g. Spacious 2BR with Marina View"
                maxLength={50}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
              />
              <div className="text-right text-[12px] text-muted mt-1">{form.title.length}/50</div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">Description</span>
                <AiWriteButton onClick={() => generateWithAi("description")} busy={aiBusy === "description"} disabled={aiBusy !== null} />
              </div>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Describe the property..."
                rows={9}
                maxLength={2000}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary resize-none"
              />
              <div className="text-right text-[12px] text-muted mt-1">{form.description.length}/2000</div>
            </div>
          </div>
        </Card>

        <Card>
          <FormSectionHeader icon={ICONS.features} label="Features" />
          <div className="flex flex-col gap-4">
            {form.propertyCategory !== "LAND" && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Furnished</label>
                <SegmentedControl
                  options={[
                    { label: "Furnished", value: "FURNISHED" },
                    { label: "Unfurnished", value: "UNFURNISHED" },
                  ]}
                  value={form.furnished}
                  onChange={(v) => update("furnished", v)}
                />
              </div>
            )}

            {form.propertyCategory !== "LAND" && form.listingType === "RENT" && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Bills</label>
                <SegmentedControl
                  options={[
                    { label: "Included", value: "INCLUDED" },
                    { label: "Excluded", value: "EXCLUDED" },
                  ]}
                  value={form.billsStatus}
                  onChange={(v) => update("billsStatus", v)}
                />
              </div>
            )}

            {form.propertyCategory && form.propertyCategory !== "LAND" && amenityOptions.length > 0 && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Amenities <span className="text-muted font-normal">(optional)</span>
                </label>
                <MultiChipSelect options={amenityOptions} value={form.amenities} onChange={(v) => update("amenities", v)} />
              </div>
            )}

            {!form.propertyCategory && <p className="text-[13px] text-muted">Select a property type above to choose furnishing and amenities.</p>}
          </div>
        </Card>

        <Card>
          <FormSectionHeader icon={ICONS.location} label="Location" />
          <div className="flex flex-col gap-3">
            <LocationCombinedInput
              area={form.area}
              community={form.community}
              onChange={(area, community) => setForm((prev) => ({ ...prev, area, community }))}
            />
            <LocationAutocomplete
              label="Building Name"
              placeholder="e.g. Marina Tower 5"
              area={form.area}
              community={form.community}
              value={form.buildingName}
              onChange={(v) => update("buildingName", v)}
            />
            <div className="flex gap-3">
              {form.propertyCategory && unitLabelFor(form.propertyCategory).showFloor && (
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Floor</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.floor}
                    onChange={(e) => update("floor", e.target.value)}
                    placeholder="12"
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
                  />
                </div>
              )}
              <div className="flex-1">
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  {form.propertyCategory ? unitLabelFor(form.propertyCategory).unitLabel : "Apartment No."}
                </label>
                <input
                  type="text"
                  value={form.apartmentNumber}
                  onChange={(e) => update("apartmentNumber", e.target.value)}
                  placeholder={form.propertyCategory ? unitLabelFor(form.propertyCategory).unitPlaceholder : "1204"}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>
        </Card>

        <PrivateDetailsSection
          value={form.privateDetails}
          onChange={(privateDetails) => update("privateDetails", privateDetails)}
          listingType={form.listingType}
        />

        {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(false)}
          className="w-full rounded-xl py-4 text-base font-bold text-white active:opacity-80 disabled:opacity-60 mt-1"
          style={{ background: "var(--primary)" }}
        >
          {submitting ? "Adding..." : "Add Property"}
        </button>
      </div>

      {duplicates && (
        <DuplicateWarningModal
          existing={duplicates}
          submitting={submitting}
          onCancel={() => setDuplicates(null)}
          onContinue={() => submit(true)}
        />
      )}
    </div>
  );
}
