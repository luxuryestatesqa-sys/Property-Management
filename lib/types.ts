export type ListingType = "RENT" | "SALE";
export type Furnished = "FURNISHED" | "UNFURNISHED";
export type BillsStatus = "INCLUDED" | "EXCLUDED";
export type ListingStatus = "ACTIVE" | "INACTIVE";
export type AvailabilityStatus = "AVAILABLE" | "RESERVED" | "RENTED" | "SOLD";
export type Role = "ADMIN" | "AGENT";
export type UserStatus = "ACTIVE" | "INACTIVE";
export type PropertyCategory =
  | "APARTMENT"
  | "VILLA"
  | "TOWNHOUSE"
  | "PENTHOUSE"
  | "DUPLEX"
  | "COMPOUND_VILLA"
  | "WHOLE_BUILDING"
  | "OFFICE"
  | "RETAIL"
  | "LAND";
export type BedroomCount =
  | "STUDIO"
  | "ONE"
  | "TWO"
  | "TWO_PLUS_MAID"
  | "THREE"
  | "THREE_PLUS_MAID"
  | "FOUR"
  | "FOUR_PLUS_MAID"
  | "FIVE"
  | "FIVE_PLUS_MAID"
  | "SIX_PLUS";

export interface ListingImageDTO {
  id: string;
  url: string;
}

export interface ListingDTO {
  id: number;
  listingType: ListingType;
  propertyCategory: PropertyCategory;
  bedrooms: BedroomCount | null;
  sizeSqm: number | null;
  // List endpoints return only the cover photo (sortOrder 0); the detail
  // endpoint returns the full set, in order.
  images: ListingImageDTO[];
  area: string;
  community: string;
  buildingName: string;
  floor: string;
  apartmentNumber: string;
  dupKey: string;
  rentPrice: number | null;
  salePrice: number | null;
  rentalValue: number | null;
  furnished: Furnished;
  billsStatus: BillsStatus;
  status: ListingStatus;
  deactivatedAt: string | null;
  availabilityStatus: AvailabilityStatus;
  createdById: string;
  createdBy: { id: string; name: string; whatsapp: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogDTO {
  id: string;
  listingId: number;
  userId: string;
  user: { name: string };
  action: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: string;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  activeListingsCount?: number;
}
