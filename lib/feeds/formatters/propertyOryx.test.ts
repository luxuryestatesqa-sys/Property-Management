import { describe, it, expect } from "vitest";
import { FeedListing } from "../types";
import { formatPropertyOryxFeed, oryxPhone, oryxTimestamp } from "./propertyOryx";

const BASE: FeedListing = {
  id: 1,
  reference: "LE-1",
  listingType: "RENT",
  propertyCategory: "APARTMENT",
  propertyCategoryLabel: "Apartment",
  bedrooms: 2,
  bathrooms: 2,
  sizeSqm: 125,
  title: "English title goes here",
  description: "The English description goes here",
  area: "Al Wakra",
  community: "Al Wakrah",
  subcommunity: "Al Wakra",
  latitude: 25.1659314,
  longitude: 51.5975524,
  buildingName: "Al Wakra",
  price: 3400,
  priceType: "monthly",
  furnished: "FURNISHED",
  availabilityStatus: "AVAILABLE",
  amenities: [],
  amenityKeys: ["central-ac", "balcony", "shared-pool"],
  images: Array.from({ length: 12 }, (_, i) => `https://crm.example.com/api/listings/1/images/img${i}.jpg?v=${i}`),
  imageDates: Array.from({ length: 12 }, () => new Date("2024-09-21T13:17:42Z")),
  updatedAt: new Date("2025-01-12T12:05:13Z"),
  agentName: "Adam Test",
  agentPhone: "+97434567890",
  agentEmail: "agent@your-domain.com",
};

// A tiny well-formedness check (balanced, correctly nested tags), since no XML parser is available.
function wellFormed(xml: string): boolean {
  const body = xml.replace(/<\?xml[^>]*\?>/, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]);
  }
  return stack.length === 0;
}
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];

describe("Property Oryx XML feed", () => {
  const xml = formatPropertyOryxFeed([BASE]);

  it("has the root and property elements the specification asks for, as valid UTF-8 XML", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<list last_update="2025-01-12 12:05:13" listing_count="1">');
    expect(xml).toContain('<property last_update="2025-01-12 12:05:13">');
    expect(xml.trim().endsWith("</list>")).toBe(true);
    expect(wellFormed(xml)).toBe(true);
  });

  it("writes a rental like the sample: codes, price, monthly period, location, text in CDATA", () => {
    expect(tag(xml, "reference_number")).toBe("LE-1");
    expect(tag(xml, "offering_type")).toBe("RR");
    expect(tag(xml, "property_type")).toBe("AP");
    expect(tag(xml, "price_on_application")).toBe("No");
    expect(tag(xml, "price")).toBe("3400");
    expect(tag(xml, "rental_period")).toBe("M");
    expect(tag(xml, "city")).toBe("<![CDATA[Al Wakra]]>");
    expect(tag(xml, "community")).toBe("<![CDATA[Al Wakrah]]>");
    expect(tag(xml, "sub_community")).toBe("<![CDATA[Al Wakra]]>");
    expect(tag(xml, "property_name")).toBe("<![CDATA[Al Wakra]]>");
    expect(tag(xml, "title_en")).toBe("<![CDATA[English title goes here]]>");
    expect(tag(xml, "description_en")).toBe("<![CDATA[The English description goes here]]>");
    expect(tag(xml, "size")).toBe("125");
    expect(tag(xml, "bedroom")).toBe("2");
    expect(tag(xml, "bathroom")).toBe("2");
    expect(tag(xml, "furnished")).toBe("Yes");
  });

  it("gives the agent with the country code, and the geopoints longitude first", () => {
    expect(xml).toContain("<agent>");
    expect(tag(xml, "name")).toBe("<![CDATA[Adam Test]]>");
    expect(tag(xml, "email")).toBe("agent@your-domain.com");
    expect(tag(xml, "phone")).toBe("+97434567890");
    expect(tag(xml, "geopoints")).toBe("51.5975524,25.1659314");
  });

  it("lists at most 10 photos, each with a last_update stamp", () => {
    const urls = [...xml.matchAll(/<url last_update="([^"]+)">([^<]+)<\/url>/g)];
    expect(urls).toHaveLength(10);
    expect(urls[0][1]).toBe("2024-09-21 13:17:42");
    expect(urls[0][2]).toContain("/api/listings/1/images/img0.jpg");
  });

  it("maps amenities to the specification's codes, comma separated", () => {
    expect(tag(xml, "amenities")).toBe("AC,BA,SP");
    // an amenity with no code in the list is left out, never guessed
    const odd = formatPropertyOryxFeed([{ ...BASE, amenityKeys: ["childrens-play-area", "private-pool"] }]);
    expect(tag(odd, "amenities")).toBe("PP");
    expect(formatPropertyOryxFeed([{ ...BASE, amenityKeys: ["childrens-play-area"] }])).not.toContain("<amenities>");
  });

  it("sales and commercial listings use the right offering and property codes, with no rental period", () => {
    const sale = formatPropertyOryxFeed([{ ...BASE, listingType: "SALE", priceType: "sale", price: 1250000.4, propertyCategory: "VILLA" }]);
    expect(tag(sale, "offering_type")).toBe("RS");
    expect(tag(sale, "property_type")).toBe("VH");
    expect(tag(sale, "price")).toBe("1250000");
    expect(sale).not.toContain("<rental_period>");
    const office = formatPropertyOryxFeed([{ ...BASE, propertyCategory: "OFFICE", bedrooms: null, bathrooms: null }]);
    expect(tag(office, "offering_type")).toBe("CR");
    expect(tag(office, "property_type")).toBe("OF");
    expect(office).not.toContain("<bedroom>"); // commercial listings carry no bedroom or bathroom
    expect(office).not.toContain("<bathroom>");
    expect(tag(formatPropertyOryxFeed([{ ...BASE, listingType: "SALE", propertyCategory: "WHOLE_BUILDING" }]), "offering_type")).toBe("CS");
  });

  it("follows the number rules: whole-number size, studio is 0, 10+ bedrooms and 7+ bathrooms", () => {
    expect(tag(formatPropertyOryxFeed([{ ...BASE, sizeSqm: 82.5 }]), "size")).toBe("83");
    expect(tag(formatPropertyOryxFeed([{ ...BASE, bedrooms: 0 }]), "bedroom")).toBe("0");
    expect(tag(formatPropertyOryxFeed([{ ...BASE, bedrooms: 11, bathrooms: 9 }]), "bedroom")).toBe("10+");
    expect(tag(formatPropertyOryxFeed([{ ...BASE, bedrooms: 11, bathrooms: 9 }]), "bathroom")).toBe("7+");
  });

  it("writes Arabic text when there is some, keeps tricky text valid, and tones down an all-caps title", () => {
    const ar = formatPropertyOryxFeed([{ ...BASE, titleAr: "شقة جميلة", descriptionAr: "وصف" }]);
    expect(tag(ar, "title_ar")).toBe("<![CDATA[شقة جميلة]]>");
    expect(tag(ar, "description_ar")).toBe("<![CDATA[وصف]]>");
    expect(xml).not.toContain("<title_ar>");
    const tricky = formatPropertyOryxFeed([{ ...BASE, title: "2BR & <great> view", description: "ends ]]> here", buildingName: "Tower \"A\" & B" }]);
    expect(wellFormed(tricky)).toBe(true);
    expect(tag(formatPropertyOryxFeed([{ ...BASE, title: "LUXURY 2 BEDROOM IN LUSAIL" }]), "title_en")).toBe("<![CDATA[Luxury 2 bedroom in lusail]]>");
  });

  it("keeps the description within 64 KB", () => {
    const huge = formatPropertyOryxFeed([{ ...BASE, description: "ن".repeat(60000) }]);
    expect(Buffer.byteLength(tag(huge, "description_en")!, "utf8")).toBeLessThan(64 * 1024);
  });

  it("leaves out what it doesn't know instead of writing blanks, and an empty feed is still valid", () => {
    const bare = formatPropertyOryxFeed([{ ...BASE, latitude: null, longitude: null, agentPhone: undefined, images: [], sizeSqm: null }]);
    for (const t of ["<geopoints>", "<size>", "<photo>"]) expect(bare).not.toContain(t);
    expect(bare).not.toContain("<phone>");
    const empty = formatPropertyOryxFeed([]);
    expect(empty).toContain('listing_count="0"');
    expect(wellFormed(empty)).toBe(true);
  });

  it("formats timestamps and phone numbers the way the specification shows", () => {
    expect(oryxTimestamp(new Date("2025-02-01T13:50:13.456Z"))).toBe("2025-02-01 13:50:13");
    expect(oryxPhone("+974 5000 0000")).toBe("+97450000000");
    expect(oryxPhone("0097450000000")).toBe("+97450000000");
    expect(oryxPhone("97450000000")).toBe("+97450000000");
    expect(oryxPhone("12")).toBeUndefined();
  });

  it("the root timestamp is the newest change across listings", () => {
    const out = formatPropertyOryxFeed([BASE, { ...BASE, id: 2, reference: "LE-2", updatedAt: new Date("2025-03-01T08:00:00Z") }]);
    expect(out).toContain('<list last_update="2025-03-01 08:00:00" listing_count="2">');
  });
});
