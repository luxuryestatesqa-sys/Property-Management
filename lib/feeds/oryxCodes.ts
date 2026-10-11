// The Property Oryx specification's code tables. Plain data, safe to import in the browser.

// Our property categories -> the specification's property_type codes.
export const ORYX_PROPERTY_TYPE: Record<string, string> = {
  APARTMENT: "AP",
  VILLA: "VH",
  TOWNHOUSE: "TH",
  PENTHOUSE: "PH",
  DUPLEX: "DX",
  COMPOUND_VILLA: "CD",
  WHOLE_BUILDING: "WB",
  OFFICE: "OF",
  RETAIL: "RE",
  LAND: "LP",
};

// Only these are residential in the specification (offering_type RS/RR; the rest are CS/CR) and only
// these carry bedroom and bathroom counts.
export const ORYX_RESIDENTIAL = new Set(["APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE", "DUPLEX", "COMPOUND_VILLA"]);

// Our amenity values (Property Finder's names) -> the "Private Amenities" codes of the specification.
// An amenity the list has no equivalent for is left out rather than guessed.
export const ORYX_AMENITY_CODES: Record<string, string> = {
  "central-ac": "AC",
  "built-in-wardrobes": "BW",
  "kitchen-appliances": "BK",
  security: "SE",
  concierge: "CS",
  "maid-service": "MS",
  balcony: "BA",
  "private-gym": "PY",
  "shared-gym": "SY",
  "private-jacuzzi": "PJ",
  "shared-spa": "SS",
  "covered-parking": "CP",
  "maids-room": "MR",
  study: "ST",
  "pets-allowed": "PA",
  "barbecue-area": "BB",
  "shared-pool": "SP",
  "private-garden": "PG",
  "private-pool": "PP",
  "view-of-water": "VW",
  "walk-in-closet": "WC",
  "conference-room": "CR",
};

export const ORYX_MAX_PHOTOS = 10;
