import { z } from "zod";
import { isResidentialCategory, bedroomOptionsFor } from "./propertyCategory";
import { MAX_LISTING_IMAGES } from "./constants";
import { PF_BATHROOM_OPTIONS } from "./propertyFinder/mapping";

const PROPERTY_CATEGORIES = [
  "APARTMENT",
  "VILLA",
  "TOWNHOUSE",
  "PENTHOUSE",
  "DUPLEX",
  "COMPOUND_VILLA",
  "WHOLE_BUILDING",
  "OFFICE",
  "RETAIL",
  "LAND",
] as const;

const BEDROOM_COUNTS = [
  "STUDIO",
  "ONE",
  "ONE_PLUS_OFFICE",
  "TWO",
  "TWO_PLUS_MAID",
  "THREE",
  "THREE_PLUS_MAID",
  "FOUR",
  "FOUR_PLUS_MAID",
  "FIVE",
  "FIVE_PLUS_MAID",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "SIX_PLUS",
] as const;

// A resized/compressed photo encoded as a data URL, capped well above what
// the client-side resize should ever produce, as a server-side safety limit.
export const listingImageSchema = z
  .string()
  .startsWith("data:image/", "Invalid image")
  .max(900_000, "Image is too large");
// When editing, a photo is either a new image or {id} of one the listing already has (kept as it is).
const listingImageRefsSchema = z
  .array(z.union([listingImageSchema, z.object({ id: z.string().min(1) })]))
  .min(1, "At least one photo is required")
  .max(MAX_LISTING_IMAGES, `Up to ${MAX_LISTING_IMAGES} photos allowed`);
const listingImagesSchema = z
  .array(listingImageSchema)
  .min(1, "At least one photo is required")
  .max(MAX_LISTING_IMAGES, `Up to ${MAX_LISTING_IMAGES} photos allowed`);

// Accepts international formats like "+974 5000 0000" or "97450000000".
const WHATSAPP_REGEX = /^\+?[0-9][0-9\s-]{6,19}$/;
export const whatsappSchema = z
  .string()
  .trim()
  .min(1, "WhatsApp number is required")
  .regex(WHATSAPP_REGEX, "Enter a valid WhatsApp number, e.g. +974 5000 0000");

export const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

// Private, agent-only fields - optional, loosely validated since they're
// free-form reference info (owner contact, title deed, notes) rather than
// data the app itself needs to act on.
//
// The preprocess step trims strings and turns "" into null (clear the
// field), while leaving `undefined` (key not sent at all) untouched - the
// update route relies on that distinction to tell "clear this field" apart
// from "this request doesn't touch this field".
const OWNER_PHONE_REGEX = /^\+?[0-9][0-9\s-]{6,19}$/;
const trimOrPassThrough = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v);
const optionalPrivateText = (max: number) => z.preprocess(trimOrPassThrough, z.string().max(max).nullable().optional());
const optionalPrivatePhone = (message: string) =>
  z.preprocess(trimOrPassThrough, z.string().regex(OWNER_PHONE_REGEX, message).nullable().optional());
// Document photos (title deed, authorization form) are resized larger than
// regular listing photos for legibility, so they get a higher size cap.
const optionalPrivateImage = () =>
  z.preprocess(trimOrPassThrough, z.string().startsWith("data:image/", "Invalid image").max(2_500_000, "Image is too large").nullable().optional());

// Emojis and HTML tags are rejected - Property Finder's API docs state these
// "are NOT yet supported" in title/description. Arabic script itself is
// fine (confirmed by Property Finder's own listing form, which has a
// dedicated English/Arabic toggle for both fields), so this only blocks
// what PF actually rejects rather than all non-ASCII text.
const EMOJI_OR_HTML_REGEX = /[<>]|[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
const marketingText = (max: number) =>
  z.preprocess(
    trimOrPassThrough,
    z
      .string()
      .max(max)
      .refine((v) => !EMOJI_OR_HTML_REGEX.test(v), "Emojis and HTML aren't supported here")
      .nullable()
      .optional()
  );

const listingMarketingFields = {
  // Matches Property Finder's own listing form limits exactly.
  title: marketingText(80),
  // Property Finder cuts at 50; edited in its publish step.
  titlePf: marketingText(50),
  description: marketingText(2000),
  // Optional Arabic variants - same limits, never required.
  titleAr: marketingText(50),
  // Qatar Living allows a longer title than Property Finder.
  titleQl: marketingText(80),
  titleOryx: marketingText(80),
  descriptionAr: marketingText(2000),
  amenities: z.array(z.string()).max(40).optional(),
  bathrooms: z.enum(PF_BATHROOM_OPTIONS as [string, ...string[]]).optional().nullable(),
};

// Property Finder's mandatory sale details. Only used for SALE listings (ignored for rentals).
const saleDetailFields = {
  projectStatus: z.enum(["RESALE_READY", "RESALE_OFF_PLAN", "PRIMARY_READY", "PRIMARY_OFF_PLAN"]).optional().nullable(),
  paymentMethods: z.enum(["CASH", "INSTALLMENTS", "CASH_AND_INSTALLMENTS"]).optional().nullable(),
  downPayment: z.number().int("Enter a whole number").min(0, "Down payment can't be negative").max(1_000_000_000).optional().nullable(),
  mortgageYears: z.number().int("Enter a whole number of years").min(1, "Enter the number of years").max(50, "That's too many years").optional().nullable(),
};

const privateListingFields = {
  ownerName: optionalPrivateText(120),
  ownerPhone: optionalPrivatePhone("Enter a valid phone number, e.g. +974 5000 0000"),
  ownerWhatsapp: optionalPrivatePhone("Enter a valid WhatsApp number, e.g. +974 5000 0000"),
  titleDeedNumber: optionalPrivateText(80),
  privateNotes: optionalPrivateText(2000),
  titleDeedImage: optionalPrivateImage(),
  authorizationFormImage: optionalPrivateImage(),
  // The owner record this listing belongs to, and when the current lease ends (a date, "2027-03-31").
  ownerId: z.preprocess(trimOrPassThrough, z.string().max(40).nullable().optional()),
  leaseEndDate: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Enter a valid date").transform((d) => new Date(d.slice(0, 10) + "T00:00:00.000Z")).nullable().optional()
  ),
};

export const listingCreateSchema = z
  .object({
    listingType: z.enum(["RENT", "SALE"]),
    propertyCategory: z.enum(PROPERTY_CATEGORIES),
    bedrooms: z.enum(BEDROOM_COUNTS).optional().nullable(),
    sizeSqm: z.number().positive("Size is required").min(10, "Size must be at least 10 sqm"),
    area: z.string().trim().min(1, "Location is required"),
    community: z.string().trim().min(1, "Area/Community is required"),
    // Optional: Property Finder doesn't need them. Blanks are filled in by the server.
    buildingName: z.string().trim().optional(),
    floor: z.string().trim().optional(),
    apartmentNumber: z.string().trim().optional(),
    rentPrice: z.number().positive().optional().nullable(),
    salePrice: z.number().positive().optional().nullable(),
    rentalValue: z.number().positive().optional().nullable(),
    ...saleDetailFields,
    furnished: z.enum(["FURNISHED", "UNFURNISHED"]),
    // Only meaningful for RENT listings - the server nulls it out for SALE
    // regardless of what's sent, so it's optional here.
    billsStatus: z.enum(["INCLUDED", "EXCLUDED"]).optional().nullable(),
    images: listingImagesSchema,
    confirmDuplicate: z.boolean().optional(),
    visibility: z.enum(["PRIVATE", "SHARED"]).optional(),
    unitDetailsPrivate: z.boolean().optional(),
    // Property Finder's own location id, picked from its search (optional - a custom location has none)
    pfLocationId: z.number().int().positive().optional().nullable(),
    ...listingMarketingFields,
    ...privateListingFields,
  })
  .superRefine((data, ctx) => {
    if (data.listingType === "RENT" && !data.rentPrice) {
      ctx.addIssue({ code: "custom", message: "Rent price is required", path: ["rentPrice"] });
    }
    if (data.listingType === "SALE" && !data.salePrice) {
      ctx.addIssue({ code: "custom", message: "Sale price is required", path: ["salePrice"] });
    }
    if (data.listingType === "SALE") {
      if (!data.projectStatus) ctx.addIssue({ code: "custom", message: "Project status is required", path: ["projectStatus"] });
      if (!data.paymentMethods) ctx.addIssue({ code: "custom", message: "Payment methods is required", path: ["paymentMethods"] });
      else if (data.paymentMethods !== "CASH") {
        if (data.downPayment === null || data.downPayment === undefined) ctx.addIssue({ code: "custom", message: "Down payment is required (enter 0 if none)", path: ["downPayment"] });
        if (!data.mortgageYears) ctx.addIssue({ code: "custom", message: "Number of years is required", path: ["mortgageYears"] });
      }
    }
    if (isResidentialCategory(data.propertyCategory) && !data.bedrooms) {
      ctx.addIssue({ code: "custom", message: "Bedrooms is required", path: ["bedrooms"] });
    }
    if (data.bedrooms && !bedroomOptionsFor(data.propertyCategory).includes(data.bedrooms)) {
      ctx.addIssue({ code: "custom", message: `"${data.bedrooms}" is not a valid bedroom count for this property type`, path: ["bedrooms"] });
    }
  });

export const listingUpdateSchema = z.object({
  propertyCategory: z.enum(PROPERTY_CATEGORIES).optional(),
  bedrooms: z.enum(BEDROOM_COUNTS).optional().nullable(),
  // Not nullable here (unlike other optional-on-update fields) - size is
  // required on every listing, so an edit may leave it untouched but must
  // never clear it back to empty.
  sizeSqm: z.number().positive("Size is required").min(10, "Size must be at least 10 sqm").optional(),
  area: z.string().trim().min(1).optional(),
  community: z.string().trim().min(1).optional(),
  buildingName: z.string().trim().optional(),
  floor: z.string().trim().optional(),
  apartmentNumber: z.string().trim().optional(),
  rentPrice: z.number().positive().optional().nullable(),
  salePrice: z.number().positive().optional().nullable(),
  rentalValue: z.number().positive().optional().nullable(),
  ...saleDetailFields,
  furnished: z.enum(["FURNISHED", "UNFURNISHED"]).optional(),
  billsStatus: z.enum(["INCLUDED", "EXCLUDED"]).optional().nullable(),
  availabilityStatus: z.enum(["AVAILABLE", "RESERVED", "RENTED", "SOLD"]).optional(),
  visibility: z.enum(["PRIVATE", "SHARED"]).optional(),
  unitDetailsPrivate: z.boolean().optional(),
  images: listingImageRefsSchema.optional(),
  pfLocationId: z.number().int().positive().optional().nullable(),
  ...listingMarketingFields,
  ...privateListingFields,
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  whatsapp: whatsappSchema,
  password: passwordSchema,
  // OWNER is only ever created by signing an agency up, never assigned here.
  role: z.enum(["ADMIN", "MANAGER", "AGENT"]).default("AGENT"),
});

export const orgUpdateSchema = z.object({
  name: z.string().trim().min(2, "Agency name is too short").max(60, "Agency name is too long").optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #8a6d1f")
    .nullable()
    .optional(),
  // A small data URL (resized client-side) or null to remove the logo.
  logoUrl: z.string().startsWith("data:image/", "Invalid image").max(400_000, "Logo is too large").nullable().optional(),
  // Hours a new lead may wait before it shows under "Needs attention".
  contactSlaHours: z.number().int().min(1, "At least 1 hour").max(168, "At most 168 hours (a week)").optional(),
});

// Creates a brand-new agency together with its first (OWNER) account.
export const signupSchema = z.object({
  agencyName: z.string().trim().min(2, "Agency name is too short").max(60, "Agency name is too long"),
  name: z.string().trim().min(1, "Your name is required"),
  email: z.string().trim().email("Valid email required"),
  whatsapp: whatsappSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const whatsappUpdateSchema = z.object({
  whatsapp: whatsappSchema,
});

export const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

// A resized/compressed image encoded as a data URL, capped well above what the
// client-side resize should ever produce, as a server-side safety limit.
export const avatarUrlSchema = z
  .string()
  .startsWith("data:image/", "Invalid image")
  .max(1_500_000, "Image is too large");

export const profileUpdateSchema = z
  .object({
    whatsapp: whatsappSchema.optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
  })
  .refine((data) => data.whatsapp !== undefined || data.avatarUrl !== undefined, {
    message: "Nothing to update",
  });
