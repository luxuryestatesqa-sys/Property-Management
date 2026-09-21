// A curated list of well-known Qatar areas/districts, used to suggest
// locations even before any listing has been posted there yet. Real listing
// data (from the database) is merged on top of this at query time, so an
// area actually in use always shows up too, even if it's not in this list.
export const QATAR_AREAS: string[] = [
  // Doha
  "Doha",
  "West Bay",
  "West Bay Lagoon",
  "Onaiza",
  "Al Dafna",
  "Diplomatic Area",
  "Old Airport",
  "Msheireb",
  "Souq Waqif",
  "Al Bidda",
  "Fereej Bin Mahmoud",
  "Fereej Bin Mahmoud North",
  "Fereej Abdul Aziz",
  "Al Sadd",
  "Al Mirqab",
  "Bin Omran",
  "Al Nasr",
  "Najma",
  "Nuaija",
  "Old Salata",
  "New Salata",
  "Al Souq",
  "Umm Ghuwailina",
  "Al Rufaa",
  "Al Ghanim",
  "Al Mansoura",
  "Al Asmakh",
  "Corniche",
  "Al Waab",
  "Aspire Zone",
  "Al Thumama",
  "Al Gharrafa",
  "Gharrafat Al Rayyan",
  "Muaither",
  "Ain Khaled",
  "Abu Hamour",
  "Al Maamoura",
  "Al Messila",
  "Al Markhiya",
  "Umm Lekhba",
  "Al Duhail",
  "Madinat Khalifa",
  "Rawdat Al Khail",
  "Al Hilal",
  "Al Sailiya",
  "Izghawa",
  "Wadi Al Banat",
  "Al Kheesa",
  "Al Kharaitiyat",
  "Umm Salal Mohammed",
  "Umm Salal Ali",
  // Lusail & The Pearl (their precincts are suggested at the
  // Area/Community level instead - see QATAR_COMMUNITIES_BY_AREA below)
  "Lusail",
  "The Pearl-Qatar",
  // Al Rayyan
  "Al Rayyan",
  "Al Rayyan Al Jadeed",
  "Bu Hamour",
  "Al Shahaniya",
  "Dukhan",
  "Zekreet",
  // Al Wakrah / Mesaieed
  "Al Wakrah",
  "Al Wukair",
  "Mesaieed",
  // Al Khor
  "Al Khor",
  "Al Thakhira",
  "Ras Laffan",
  "Simaisma",
  // Al Daayen
  "Al Daayen",
  "Leabaib",
  "Umm Qarn",
  // Al Shamal
  "Madinat ash Shamal",
  "Al Ruwais",
  "Al Zubarah",
].sort((a, b) => a.localeCompare(b));

// Curated precincts/zones within specific Qatar areas, keyed by the area
// name (case-insensitive lookup). Suggested at the Area/Community level once
// that parent area is selected, merged with whatever's already in the DB.
export const QATAR_COMMUNITIES_BY_AREA: Record<string, string[]> = {
  "the pearl-qatar": [
    "Porto Arabia",
    "Viva Bahriya",
    "Qanat Quartier",
    "Medina Centrale",
    "Abraj Quartier",
    "Giardino Village",
    "Floresta Gardens",
    "Isola Dana",
    "Costa Malaz",
  ],
  lusail: [
    "Fox Hills North",
    "Fox Hills South",
    "Yasmeen City",
    "Lusail Marina",
    "Huzoom Lusail",
    "Al Erkyah",
    "Al Qutaifiya",
    "Al Furjan",
    "Energy City",
    "Qetaifan Islands",
  ],
};

// Flat lookup so typing a precinct name anywhere (e.g. "Marina") can resolve
// straight to its parent area + the precinct itself, e.g. "Lusail Marina" ->
// { area: "Lusail", community: "Lusail Marina" } - without this, someone
// searching by precinct name would have to already know which area it's in.
export const QATAR_COMMUNITY_TO_AREA: Record<string, { area: string; community: string }> = (() => {
  const map: Record<string, { area: string; community: string }> = {};
  for (const [areaKey, communities] of Object.entries(QATAR_COMMUNITIES_BY_AREA)) {
    const canonicalArea = QATAR_AREAS.find((a) => a.toLowerCase() === areaKey) ?? areaKey;
    for (const community of communities) {
      map[community.toLowerCase()] = { area: canonicalArea, community };
    }
  }
  return map;
})();

export interface LocationSuggestion {
  area: string;
  community: string;
  display: string;
}

// One flat, pickable list for a single combined "Location" field: every
// plain area (self-referential - area and community are the same, since
// most Qatar areas don't have a further-named precinct) plus every known
// precinct (shown as "Precinct, Area"). Selecting either resolves both the
// area and community in one tap, so the form never needs two separate boxes
// for what a user thinks of as one "location".
export const QATAR_LOCATION_SUGGESTIONS: LocationSuggestion[] = [
  ...QATAR_AREAS.map((area) => ({ area, community: area, display: area })),
  ...Object.values(QATAR_COMMUNITY_TO_AREA).map(({ area, community }) => ({
    area,
    community,
    display: `${community}, ${area}`,
  })),
].sort((a, b) => a.display.localeCompare(b.display));
