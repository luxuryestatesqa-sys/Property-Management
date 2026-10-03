// AI-written listing title + description for Property Finder. The model only
// writes the marketing body; everything that must be exactly right - the
// length limits, "no emojis", and the agent's name/phone call to action - is
// enforced here in plain code afterwards, never trusted to the model.

export const TITLE_MAX = 50;
export const DESCRIPTION_MAX = 2000;

export type CopyLang = "en" | "ar";
export type CopyField = "title" | "description" | "both";

export interface ListingCopyInput {
  lang: CopyLang;
  listingType: "RENT" | "SALE";
  category: string; // e.g. "Apartment"
  bedrooms: string | null; // e.g. "2 Bedroom" / "Studio"
  bathrooms: string | null;
  sizeSqm: number | null;
  furnished: "FURNISHED" | "UNFURNISHED";
  area: string;
  community: string;
  locationLabel: string | null; // Property Finder's own location name, if chosen
  amenities: string[]; // human labels
  agentName: string;
  agentPhone: string;
}

// Deliberately NOT part of the input: the building name, floor and unit
// number (internal-only, must never reach Property Finder) and the price (PF
// shows it separately, and copy that repeats it goes stale when it changes).

export function buildMessages(input: ListingCopyInput, field: CopyField = "both", currentTitle?: string): { system: string; user: string } {
  const arabic = input.lang === "ar";
  const system = [
    "You write property listing copy for Property Finder Qatar.",
    `Write in ${arabic ? "Modern Standard Arabic" : "clear, professional English"}.`,
    "Rules, all mandatory:",
    "- Plain text only. No emojis, no symbols used as decoration, no markdown, no hashtags, no ALL CAPS words.",
    ...(field !== "description" ? [`- Title: at most ${TITLE_MAX} characters, specific and factual (type, bedrooms, area). No quotation marks, no trailing full stop.`] : []),
    ...(field !== "title"
      ? ["- Description: 3 to 4 short paragraphs separated by a blank line, roughly 900 to 1400 characters. Open with the key selling point, then layout and features, then the location and neighbourhood."]
      : []),
    "- Use ONLY the facts provided. Never invent views, floors, finishes, distances, prices, or amenities that are not listed.",
    "- Never mention a building name, floor number, unit number, price, phone number, email or website.",
    "- Do not write a call to action or contact line - it is added separately.",
    field === "title" ? 'Return JSON only: {"title": string}.' : field === "description" ? 'Return JSON only: {"description": string}.' : 'Return JSON only: {"title": string, "description": string}.',
  ].join("\n");

  const facts = [
    `Purpose: ${input.listingType === "RENT" ? "For rent" : "For sale"}`,
    `Property type: ${input.category}`,
    input.bedrooms ? `Bedrooms: ${input.bedrooms}` : null,
    input.bathrooms ? `Bathrooms: ${input.bathrooms}` : null,
    input.sizeSqm ? `Size: ${input.sizeSqm} sqm` : null,
    `Furnishing: ${input.furnished === "FURNISHED" ? "Furnished" : "Unfurnished"}`,
    `Area: ${input.area}`,
    input.community && input.community !== input.area ? `Community: ${input.community}` : null,
    input.locationLabel ? `Property Finder location: ${input.locationLabel}` : null,
    input.amenities.length > 0 ? `Amenities: ${input.amenities.join(", ")}` : null,
  ].filter(Boolean);

  const what = field === "title" ? "the title" : field === "description" ? "the description" : "the title and description";
  const titleHint = field === "description" && currentTitle ? `\nThe listing's title is: ${currentTitle}` : "";
  return { system, user: `Write ${what} for this listing.\n\n${facts.join("\n")}${titleHint}` };
}

const EMOJI_AND_JOINERS = /[\p{Extended_Pictographic}\p{Emoji_Presentation}︎️‍⃣]/gu;

export function stripEmojis(text: string): string {
  return text.replace(EMOJI_AND_JOINERS, "");
}

// Drops markdown/decoration a model sometimes adds despite instructions.
function toPlainText(text: string): string {
  return stripEmojis(text)
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

export function cleanTitle(raw: string): string {
  const oneLine = toPlainText(raw).replace(/\s*\n+\s*/g, " ").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/[.\s]+$/g, "");
  return clampAtWord(oneLine, TITLE_MAX);
}

export function callToAction(lang: CopyLang, agentName: string, agentPhone: string): string {
  return lang === "ar"
    ? `لحجز موعد معاينة، تواصل مع ${agentName} على الرقم ${agentPhone}.`
    : `To arrange a viewing, contact ${agentName} on ${agentPhone}.`;
}

// Cleans the model's body and appends the agent call to action, keeping the
// whole description within Property Finder's limit - the body is shortened
// (at a sentence boundary where possible) to make room for the CTA, never the
// other way round.
export function buildDescription(rawBody: string, lang: CopyLang, agentName: string, agentPhone: string): string {
  const cta = callToAction(lang, agentName, agentPhone);
  const room = DESCRIPTION_MAX - cta.length - 2; // blank line before the CTA
  let body = toPlainText(rawBody);
  if (body.length > room) {
    const cut = body.slice(0, room);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"), cut.lastIndexOf("。"));
    body = (lastStop > room * 0.5 ? cut.slice(0, lastStop + 1) : clampAtWord(cut, room)).trim();
  }
  return `${body}\n\n${cta}`;
}

export class AiCopyError extends Error {}

// Parses the model's JSON reply into the two cleaned fields.
export function parseAndFinish(
  content: string,
  lang: CopyLang,
  agentName: string,
  agentPhone: string,
  field: CopyField = "both"
): { title?: string; description?: string } {
  let parsed: { title?: unknown; description?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiCopyError("The AI returned an unreadable answer. Please try again.");
  }
  const needTitle = field !== "description";
  const needDescription = field !== "title";
  const titleOk = typeof parsed.title === "string" && parsed.title.trim() !== "";
  const descriptionOk = typeof parsed.description === "string" && parsed.description.trim() !== "";
  if ((needTitle && !titleOk) || (needDescription && !descriptionOk)) {
    throw new AiCopyError(`The AI didn't return ${field === "both" ? "a title and description" : `a ${field}`}. Please try again.`);
  }
  return {
    ...(needTitle ? { title: cleanTitle(parsed.title as string) } : {}),
    ...(needDescription ? { description: buildDescription(parsed.description as string, lang, agentName, agentPhone) } : {}),
  };
}
