import { FeedListing } from "../types";
import { xmlTag, joinTags } from "../xml";

// Building blocks the XML feeds share - the agent contact and amenity list
// are the same shape everywhere, so they live here once.
export function amenitiesXml(l: FeedListing): string {
  if (l.amenities.length === 0) return "";
  return `<amenities>${l.amenities.map((a) => xmlTag("amenity", a)).join("")}</amenities>`;
}

export function agentXml(l: FeedListing): string {
  const inner = [xmlTag("name", l.agentName), xmlTag("phone", l.agentPhone), xmlTag("email", l.agentEmail)];
  if (inner.every((t) => t === "")) return "";
  return joinTags(["<agent>", ...inner, "</agent>"]);
}

export function imagesXml(l: FeedListing): string {
  if (l.images.length === 0) return "";
  // Image URLs are already absolute http(s) URLs (built in generateFeed.ts) -
  // XML-escaping the ampersands in the query string is all they need.
  return `<images>${l.images.map((url) => `<image>${url.replace(/&/g, "&amp;")}</image>`).join("")}</images>`;
}
