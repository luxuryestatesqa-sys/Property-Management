import { PropertyCategory, BedroomCount, ListingType } from "@/lib/types";
import type { PrivateDetailsValue } from "../PrivateDetailsSection";

export interface AddForm {
  listingType: ListingType;
  propertyCategory: PropertyCategory | "";
  bedrooms: BedroomCount | "";
  bathrooms: string;
  sizeSqm: string;
  title: string;
  description: string;
  amenities: string[];
  rentPrice: string;
  salePrice: string;
  rentalValue: string;
  // Property Finder's mandatory sale details (kept as text while typing).
  projectStatus: string;
  paymentMethods: string;
  downPayment: string;
  mortgageYears: string;
  furnished: "FURNISHED" | "UNFURNISHED";
  billsStatus: "INCLUDED" | "EXCLUDED";
  visibility: "PRIVATE" | "SHARED";
  unitDetailsPrivate: boolean;
  area: string;
  community: string;
  pfLocationId: number | null;
  pfLocationLabel: string;
  buildingName: string;
  floor: string;
  apartmentNumber: string;
  images: string[];
  privateDetails: PrivateDetailsValue;
}
