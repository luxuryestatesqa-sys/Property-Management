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
  bathrooms: string | null;
  sizeSqm: number | null;
  // List endpoints return only the cover photo (sortOrder 0); the detail
  // endpoint returns the full set, in order.
  images: ListingImageDTO[];
  title: string | null;
  description: string | null;
  titleAr: string | null;
  descriptionAr: string | null;
  amenities: string[];
  // Property Finder's own location-tree id, chosen via autocomplete.
  pfLocationId: number | null;
  // Property Finder's own description of that location (saved server-side).
  pfLocation?: { name: string; tree: { name: string }[] } | null;
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
  // Only meaningful for RENT listings; always null for SALE.
  billsStatus: BillsStatus | null;
  // Private, agent-only fields. Only ever populated by the API when the
  // viewer is the listing's own creator or an admin - null otherwise,
  // indistinguishable from "not filled in". See lib/listingPrivacy.ts.
  ownerName: string | null;
  ownerPhone: string | null;
  ownerWhatsapp: string | null;
  titleDeedNumber: string | null;
  privateNotes: string | null;
  titleDeedImage: string | null;
  authorizationFormImage: string | null;
  status: ListingStatus;
  deactivatedAt: string | null;
  availabilityStatus: AvailabilityStatus;
  createdById: string;
  createdBy: { id: string; name: string; whatsapp: string; avatarUrl: string | null; pfPublicProfileId: number | null };
  createdAt: string;
  updatedAt: string;
  propertyFinderState: PropertyFinderListingDTO | null;
  channelStates: Record<PullChannel, ChannelStateDTO | null>;
}

export interface PropertyFinderListingDTO {
  remoteListingId: string | null;
  state: string | null;
  enabled: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
  assignedProfileId: number | null;
  reference: string | null;
}

// The channels that are just a PortalListing.enabled flag (read by the
// public listing page / that portal's feed) rather than a real API push
// like Property Finder.
export type PullChannel = "WEBSITE" | "QATAR_LIVING" | "PROPERTY_ORYX" | "OTHER_PORTALS";

export interface ChannelStateDTO {
  enabled: boolean;
  updatedAt: string;
}

// Safe-to-share subset of ListingDTO returned by the public (unauthenticated)
// share link - deliberately excludes createdBy, private owner fields, and
// anything else that would identify or contact the listing's own agent.
export interface PublicListingDTO {
  id: number;
  listingType: ListingType;
  propertyCategory: PropertyCategory;
  bedrooms: BedroomCount | null;
  sizeSqm: number | null;
  images: ListingImageDTO[];
  area: string;
  community: string;
  buildingName: string;
  floor: string;
  apartmentNumber: string;
  rentPrice: number | null;
  salePrice: number | null;
  rentalValue: number | null;
  furnished: Furnished;
  billsStatus: BillsStatus | null;
  availabilityStatus: AvailabilityStatus;
}

// The agent who generated the share link (from its `?agent=` param), shown
// as the contact for a shared listing instead of whoever originally created it.
export interface PublicAgentDTO {
  name: string;
  whatsapp: string;
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
  // This agent's Property Finder public profile id, if an admin has linked one.
  pfPublicProfileId: number | null;
}
