"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SegmentedControl from "@/components/SegmentedControl";
import CollapsibleChipSelect from "@/components/CollapsibleChipSelect";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import LocationCombinedInput from "@/components/LocationCombinedInput";
import DuplicateWarningModal from "@/components/DuplicateWarningModal";
import PhotoPicker from "@/components/PhotoPicker";
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
import { extractErrorMessage } from "@/lib/errors";

type ListingType = "RENT" | "SALE";

const PROPERTY_TYPE_OPTIONS = PROPERTY_CATEGORY_OPTIONS.map((c) => ({ label: PROPERTY_CATEGORY_LABELS[c], value: c }));

const initialState = {
  listingType: "RENT" as ListingType,
  propertyCategory: "" as PropertyCategory | "",
  bedrooms: "" as BedroomCount | "",
  sizeSqm: "",
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

export default function AddPropertyPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<ListingDTO[] | null>(null);
  const [success, setSuccess] = useState(false);

  function update<K extends keyof typeof initialState>(key: K, value: (typeof initialState)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.propertyCategory) return "Property type is required";
    if (isResidentialCategory(form.propertyCategory) && !form.bedrooms) return "Bedrooms is required";
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
          sizeSqm: form.sizeSqm ? Number(form.sizeSqm) : undefined,
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
          images: form.images.length > 0 ? form.images : undefined,
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
      const data = await res.json();
      if (!res.ok) {
        setError(extractErrorMessage(data.error, "Something went wrong. Please check the form and try again."));
        return;
      }
      if (data.duplicate) {
        setDuplicates(data.existing);
        return;
      }
      setDuplicates(null);
      setSuccess(true);
      setTimeout(() => {
        router.push(`/property/${data.listing.id}`);
      }, 900);
    } catch {
      setError("Network error. Please try again.");
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

  return (
    <div className="px-4 pb-8">
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3">
        <h1 className="text-xl font-bold">Add Property</h1>
        <p className="text-sm text-muted mt-0.5">Takes just a few seconds</p>
      </div>

      <div className="flex flex-col gap-5">
        <section>
          <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Listing Type</h3>
          <SegmentedControl
            options={[
              { label: "For Rent", value: "RENT" },
              { label: "For Sale", value: "SALE" },
            ]}
            value={form.listingType}
            onChange={(v) => update("listingType", v)}
          />
        </section>

        <section>
          <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">
            Photos <span className="text-muted font-normal normal-case">(optional)</span>
          </h3>
          <PhotoPicker images={form.images} onChange={(images) => update("images", images)} />
        </section>

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

        <section>
          <label className="text-sm font-medium text-foreground block mb-1.5">
            Size <span className="text-muted font-normal">(optional)</span>
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
        </section>

        {form.listingType === "RENT" ? (
          <section>
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
          </section>
        ) : (
          <>
            <section>
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
            </section>
            <section>
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
            </section>
          </>
        )}

        {form.propertyCategory !== "LAND" && (
          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Furnished</h3>
            <SegmentedControl
              options={[
                { label: "Furnished", value: "FURNISHED" },
                { label: "Unfurnished", value: "UNFURNISHED" },
              ]}
              value={form.furnished}
              onChange={(v) => update("furnished", v)}
            />
          </section>
        )}

        {form.propertyCategory !== "LAND" && form.listingType === "RENT" && (
          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Bills</h3>
            <SegmentedControl
              options={[
                { label: "Included", value: "INCLUDED" },
                { label: "Excluded", value: "EXCLUDED" },
              ]}
              value={form.billsStatus}
              onChange={(v) => update("billsStatus", v)}
            />
          </section>
        )}

        <section>
          <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Location</h3>
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
        </section>

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
          className="w-full rounded-xl py-4 text-base font-bold text-white active:opacity-80 disabled:opacity-60 mt-2"
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
