"use client";

import { AddAsideData } from "@/components/desktop/AddPropertyAside";
import AddPropertySimple from "@/components/desktop/AddPropertySimple";
import { useState } from "react";
import { useRouter } from "next/navigation";
import DuplicateWarningModal from "@/components/DuplicateWarningModal";
import { EMPTY_PRIVATE_DETAILS, PrivateDetailsValue } from "@/components/PrivateDetailsSection";
import { ListingDTO, PropertyCategory, BedroomCount } from "@/lib/types";
import {
  isResidentialCategory,
  unitLabelFor,
  NO_FLOOR_VALUE,
} from "@/lib/propertyCategory";
import { bathroomsFromInputValue } from "@/lib/propertyFinder/mapping";
import { extractErrorMessage } from "@/lib/errors";
import { splitPhotoBatches } from "@/lib/photoBatches";
import { EMPTY_SALE_DETAILS, saleDetailsPayload, saleDetailsProblem } from "@/components/SaleDetailsFields";

type ListingType = "RENT" | "SALE";


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
  ...EMPTY_SALE_DETAILS,
  furnished: "FURNISHED" as "FURNISHED" | "UNFURNISHED",
  billsStatus: "INCLUDED" as "INCLUDED" | "EXCLUDED",
  visibility: "SHARED" as "PRIVATE" | "SHARED",
  unitDetailsPrivate: true, // floor and unit number stay private unless the agent chooses otherwise
  area: "",
  community: "",
  pfLocationId: null as number | null,
  pfLocationLabel: "",
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
    if (!(Number(form.sizeSqm) > 0)) return "Size is required";
    if (form.images.length === 0) return "At least one photo is required";
    if (!form.area.trim()) return "Location is required";
    if (!form.community.trim()) return "Area / Community is required";
    if (form.listingType === "RENT" && !(Number(form.rentPrice) > 0)) return "Rent price is required";
    if (form.listingType === "SALE" && !(Number(form.salePrice) > 0)) return "Sale price is required";
    if (form.listingType === "SALE") return saleDetailsProblem(form);
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
    // A request can only carry so much, so the first photos go with the listing and the rest follow.
    const photoBatches = splitPhotoBatches(form.images);
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
          pfLocationId: form.pfLocationId ?? undefined,
          buildingName: form.buildingName,
          floor: unitLabelFor(form.propertyCategory as PropertyCategory).showFloor ? form.floor : NO_FLOOR_VALUE,
          apartmentNumber: form.apartmentNumber,
          rentPrice: form.listingType === "RENT" ? Number(form.rentPrice) : undefined,
          salePrice: form.listingType === "SALE" ? Number(form.salePrice) : undefined,
          rentalValue: form.listingType === "SALE" && form.rentalValue ? Number(form.rentalValue) : undefined,
          ...(form.listingType === "SALE" ? saleDetailsPayload(form) : {}),
          furnished: form.furnished,
          billsStatus: form.listingType === "RENT" ? form.billsStatus : undefined,
          images: photoBatches[0],
          visibility: form.visibility,
          unitDetailsPrivate: form.unitDetailsPrivate,
          ownerName: form.privateDetails.ownerName || undefined,
          ownerPhone: form.privateDetails.ownerPhone || undefined,
          ownerWhatsapp: form.privateDetails.ownerWhatsapp || undefined,
          titleDeedNumber: form.privateDetails.titleDeedNumber || undefined,
          privateNotes: form.privateDetails.privateNotes || undefined,
          titleDeedImage: form.privateDetails.titleDeedImage || undefined,
          authorizationFormImage: form.privateDetails.authorizationFormImage || undefined,
          ownerId: form.privateDetails.ownerId || undefined,
          leaseEndDate: form.listingType === "RENT" ? form.privateDetails.leaseEndDate || undefined : undefined,
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
      const moreBatches = photoBatches.slice(1);
      if (moreBatches.length > 0) {
        try {
          for (const batch of moreBatches) {
            const up = await fetch(`/api/listings/${data.listing.id}/images`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: batch }) });
            if (!up.ok) throw new Error(extractErrorMessage((await up.json().catch(() => null))?.error, "Couldn't upload the rest of the photos."));
          }
        } catch (err) {
          setError(`The listing was saved, but not every photo uploaded. ${err instanceof Error ? err.message : ""} Open it and add the rest.`);
          router.push(`/property/${data.listing.id}?edit=1`);
          return;
        }
      }
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

  const asideData: AddAsideData = {
    listingType: form.listingType,
    propertyCategory: form.propertyCategory,
    bedrooms: form.bedrooms,
    sizeSqm: form.sizeSqm,
    price: form.listingType === "RENT" ? form.rentPrice : form.salePrice,
    cover: form.images[0] ?? null,
    photoCount: form.images.length,
    area: form.area,
    community: form.community,
    buildingName: form.buildingName,
    recommended: [{ label: "Title & description", done: Boolean(form.title.trim() && form.description.trim()), target: "sec-text" }],
    checklist: [
      { label: "Property type", done: Boolean(form.propertyCategory), target: "sec-type" },
      ...(form.propertyCategory && isResidentialCategory(form.propertyCategory) ? [{ label: "Bedrooms", done: Boolean(form.bedrooms), target: "sec-type" }] : []),
      { label: "Size", done: Number(form.sizeSqm) > 0, target: "sec-type" },
      { label: form.listingType === "RENT" ? "Rent price" : "Sale price", done: Number(form.listingType === "RENT" ? form.rentPrice : form.salePrice) > 0, target: "sec-price" },
      // Property Finder needs these two to publish a sale, so a sale is not "ready" without them.
      ...(form.listingType === "SALE"
        ? [
            { label: "Project status", done: Boolean(form.projectStatus), target: "sec-price" },
            { label: "Payment methods", done: Boolean(form.paymentMethods) && !saleDetailsProblem(form), target: "sec-price" },
          ]
        : []),
      { label: "At least one photo", done: form.images.length > 0, target: "sec-photos" },
      { label: "Location & area", done: Boolean(form.area.trim() && form.community.trim()), target: "sec-where" },
    ],
  };

  return (
    <>
        <AddPropertySimple
          form={form}
          setForm={setForm}
          update={update}
          aside={asideData}
          error={error}
          submitting={submitting}
          aiBusy={aiBusy}
          aiError={aiError}
          generateWithAi={generateWithAi}
          onSubmit={() => submit(false)}
        />
        {duplicates && <DuplicateWarningModal existing={duplicates} submitting={submitting} onCancel={() => setDuplicates(null)} onContinue={() => submit(true)} />}
    </>
  );
}
