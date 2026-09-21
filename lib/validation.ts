import { z } from "zod";
import { isResidentialCategory, bedroomOptionsFor } from "./propertyCategory";
import { MAX_LISTING_IMAGES } from "./constants";

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
  "TWO",
  "TWO_PLUS_MAID",
  "THREE",
  "THREE_PLUS_MAID",
  "FOUR",
  "FOUR_PLUS_MAID",
  "FIVE",
  "FIVE_PLUS_MAID",
  "SIX_PLUS",
] as const;

// A resized/compressed photo encoded as a data URL, capped well above what
// the client-side resize should ever produce, as a server-side safety limit.
const listingImageSchema = z
  .string()
  .startsWith("data:image/", "Invalid image")
  .max(900_000, "Image is too large");
const listingImagesSchema = z.array(listingImageSchema).max(MAX_LISTING_IMAGES, `Up to ${MAX_LISTING_IMAGES} photos allowed`);

// Accepts international formats like "+974 5000 0000" or "97450000000".
const WHATSAPP_REGEX = /^\+?[0-9][0-9\s-]{6,19}$/;
export const whatsappSchema = z
  .string()
  .trim()
  .min(1, "WhatsApp number is required")
  .regex(WHATSAPP_REGEX, "Enter a valid WhatsApp number, e.g. +974 5000 0000");

export const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export const listingCreateSchema = z
  .object({
    listingType: z.enum(["RENT", "SALE"]),
    propertyCategory: z.enum(PROPERTY_CATEGORIES),
    bedrooms: z.enum(BEDROOM_COUNTS).optional().nullable(),
    sizeSqm: z.number().positive().optional().nullable(),
    area: z.string().trim().min(1, "Location is required"),
    community: z.string().trim().min(1, "Area/Community is required"),
    buildingName: z.string().trim().min(1, "Building name is required"),
    floor: z.string().trim().min(1, "Floor is required"),
    apartmentNumber: z.string().trim().min(1, "Apartment number is required"),
    rentPrice: z.number().positive().optional().nullable(),
    salePrice: z.number().positive().optional().nullable(),
    rentalValue: z.number().positive().optional().nullable(),
    furnished: z.enum(["FURNISHED", "UNFURNISHED"]),
    billsStatus: z.enum(["INCLUDED", "EXCLUDED"]),
    images: listingImagesSchema.optional(),
    confirmDuplicate: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.listingType === "RENT" && !data.rentPrice) {
      ctx.addIssue({ code: "custom", message: "Rent price is required", path: ["rentPrice"] });
    }
    if (data.listingType === "SALE" && !data.salePrice) {
      ctx.addIssue({ code: "custom", message: "Sale price is required", path: ["salePrice"] });
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
  sizeSqm: z.number().positive().optional().nullable(),
  area: z.string().trim().min(1).optional(),
  community: z.string().trim().min(1).optional(),
  buildingName: z.string().trim().min(1).optional(),
  floor: z.string().trim().min(1).optional(),
  apartmentNumber: z.string().trim().min(1).optional(),
  rentPrice: z.number().positive().optional().nullable(),
  salePrice: z.number().positive().optional().nullable(),
  rentalValue: z.number().positive().optional().nullable(),
  furnished: z.enum(["FURNISHED", "UNFURNISHED"]).optional(),
  billsStatus: z.enum(["INCLUDED", "EXCLUDED"]).optional(),
  availabilityStatus: z.enum(["AVAILABLE", "RESERVED", "RENTED", "SOLD"]).optional(),
  images: listingImagesSchema.optional(),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  whatsapp: whatsappSchema,
  password: passwordSchema,
  role: z.enum(["ADMIN", "AGENT"]).default("AGENT"),
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
