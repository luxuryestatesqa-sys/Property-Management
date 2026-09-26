import { BedroomCount } from "./types";

// Free-text search should understand the way agents and clients actually type
// bedroom counts - "2BHK", "2 BR", "two bedroom", "2-bed", "studio flat",
// "3 bedroom + maid" - not just literal matches against location/building
// text. This turns a search query into the BedroomCount values it implies,
// so e.g. typing "2br" surfaces every 2-bedroom listing regardless of where
// its location fields mention "2br" (they never will).
const WORD_TO_DIGIT: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const DIGIT_TO_BEDROOM: Partial<Record<number, BedroomCount>> = {
  1: "ONE",
  2: "TWO",
  3: "THREE",
  4: "FOUR",
  5: "FIVE",
};

const DIGIT_TO_BEDROOM_PLUS_MAID: Partial<Record<number, BedroomCount>> = {
  2: "TWO_PLUS_MAID",
  3: "THREE_PLUS_MAID",
  4: "FOUR_PLUS_MAID",
  5: "FIVE_PLUS_MAID",
};

const STUDIO_REGEX = /\bstudio\b/i;
const MAID_REGEX = /\bmaid'?s?\b/i;

// Matches a bedroom-count phrase anywhere in the query: a number (digit or
// word) immediately followed - with an optional space/hyphen/plus - by one
// of the common shorthand or full spellings for "bedroom".
const NUMBER_WORD = "(?:one|two|three|four|five|six|seven|eight|nine)";
const BEDROOM_PHRASE_REGEX = new RegExp(`\\b(\\d{1,2}|${NUMBER_WORD})\\s*[-+]?\\s*(?:bhk|br|bed\\s*rooms?|bedrooms?|beds?)\\b`, "i");

// Same number+suffix shape as above, but the suffix ("bhk"/"br"/"bedroom"/...)
// is optional and the whole thing is anchored end-to-end - used only to
// recognize a query that is *nothing but* a bedroom expression (see
// parseBareBedroomQuery below).
const BARE_BEDROOM_REGEX = new RegExp(`^(\\d{1,2}|${NUMBER_WORD})\\s*[-+]?\\s*((?:bhk|br|bed\\s*rooms?|bedrooms?|beds?))?(\\+)?$`, "i");

// A "+ Maid" listing is still fundamentally that many bedrooms (just with an
// extra maid's room), so searching a bare count ("4") should surface both
// the plain and "+ Maid" variant of it - only an explicit "maid" keyword
// narrows the match down to just the "+ Maid" variant.
function bedroomsForCount(n: number, hasMaid: boolean): BedroomCount[] {
  if (n >= 6) return ["SIX_PLUS"];
  if (hasMaid) {
    const plusMaid = DIGIT_TO_BEDROOM_PLUS_MAID[n];
    return plusMaid ? [plusMaid] : [];
  }
  return [DIGIT_TO_BEDROOM[n], DIGIT_TO_BEDROOM_PLUS_MAID[n]].filter((b): b is BedroomCount => Boolean(b));
}

export function parseBedroomKeywords(query: string): BedroomCount[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches = new Set<BedroomCount>();
  if (STUDIO_REGEX.test(q)) matches.add("STUDIO");

  const bedroomMatch = q.match(BEDROOM_PHRASE_REGEX);
  if (bedroomMatch) {
    const n = WORD_TO_DIGIT[bedroomMatch[1]] ?? Number(bedroomMatch[1]);
    if (Number.isFinite(n) && n >= 1) {
      for (const bedroom of bedroomsForCount(n, MAID_REGEX.test(q))) matches.add(bedroom);
    }
  }

  return [...matches];
}

// Recognizes a query that consists of nothing but a bedroom expression - a
// bare number ("2", "two"), optionally with a shorthand suffix ("2br",
// "2bhk", "3 bedroom") and/or a maid's-room qualifier ("2 + maid", "3bhk
// maid") - with no other words in the box. Returns null for anything else,
// including a bedroom phrase embedded in a longer query ("lusail 2br"),
// which parseBedroomKeywords already handles inclusively.
//
// The API route treats a match here as *exclusive*: a bare "2" should show
// only 2-bedroom listings, not also every listing whose floor, apartment
// number, or listing ID happens to contain the digit "2".
export function parseBareBedroomQuery(query: string): BedroomCount[] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  if (/^studio(?:\s+(?:apartment|flat))?$/.test(q)) return ["STUDIO"];

  const maidMatch = q.match(/^(.*?)\s*(?:\+|plus|with|and)?\s*maid'?s?(?:\s*room)?$/);
  const hasMaid = !!maidMatch;
  const core = (hasMaid ? maidMatch![1] : q).trim();
  if (!core) return null;

  const coreMatch = core.match(BARE_BEDROOM_REGEX);
  if (!coreMatch) return null;

  const n = WORD_TO_DIGIT[coreMatch[1]] ?? Number(coreMatch[1]);
  if (!Number.isFinite(n) || n < 1) return null;

  // A two-digit number with nothing else to disambiguate it ("12", "24") is
  // far more likely a floor, apartment, or listing number than a bedroom
  // count - only treat it as one when a suffix, "+", or maid qualifier makes
  // the intent explicit ("12br", "6+", "5 + maid").
  const hasSuffix = Boolean(coreMatch[2]) || Boolean(coreMatch[3]) || hasMaid;
  if (!hasSuffix && n >= 10) return null;

  const bedrooms = bedroomsForCount(n, hasMaid);
  return bedrooms.length > 0 ? bedrooms : null;
}
