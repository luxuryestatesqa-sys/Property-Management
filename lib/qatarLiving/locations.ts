// Maps this app's area/community strings (lib/qatarLocations.ts) to Qatar
// Living's own city + area taxonomy (their feed API spec, Appendix A) plus
// an approximate centroid. Per the spec, the area/city *names* are the
// primary signal QL uses to place a listing - coordinates are only a
// fallback for when the name can't be resolved - so these only need to be
// in the right neighbourhood, not survey-accurate.
//
// Every entry's `area` is QL's own area name where one genuinely matches;
// where nothing in their ~160-entry list fits, this uses "Other" (an
// accepted value per their spec) rather than guessing a wrong match.

interface QLLocation {
  city: string;
  area: string;
  latitude: number;
  longitude: number;
}

const DOHA_FALLBACK: QLLocation = { city: "Doha", area: "Other", latitude: 25.2854, longitude: 51.531 };

// Keyed by lowercased area name (lib/qatarLocations.ts QATAR_AREAS).
const AREA_LOCATIONS: Record<string, QLLocation> = {
  doha: { city: "Doha", area: "Other", latitude: 25.2854, longitude: 51.531 },
  "west bay": { city: "Doha", area: "West Bay", latitude: 25.325, longitude: 51.53 },
  "west bay lagoon": { city: "Doha", area: "West Bay Lagoon", latitude: 25.38, longitude: 51.505 },
  onaiza: { city: "Doha", area: "Onaiza", latitude: 25.335, longitude: 51.523 },
  "al dafna": { city: "Doha", area: "Al Dafna", latitude: 25.323, longitude: 51.528 },
  "diplomatic area": { city: "Doha", area: "Diplomatic Area", latitude: 25.319, longitude: 51.524 },
  "old airport": { city: "Doha", area: "Old Airport", latitude: 25.25, longitude: 51.562 },
  msheireb: { city: "Musheirab", area: "Musheirab", latitude: 25.286, longitude: 51.52 },
  "souq waqif": { city: "Doha", area: "Souq Waqif", latitude: 25.2867, longitude: 51.5324 },
  "al bidda": { city: "Doha", area: "Al Bidda", latitude: 25.292, longitude: 51.528 },
  "fereej bin mahmoud": { city: "Doha", area: "Fereej Bin Mahmoud", latitude: 25.273, longitude: 51.53 },
  "fereej bin mahmoud north": { city: "Doha", area: "Fereej Bin Mahmoud", latitude: 25.277, longitude: 51.531 },
  "fereej abdul aziz": { city: "Doha", area: "Fereej Abdel Aziz", latitude: 25.28, longitude: 51.523 },
  "al sadd": { city: "Doha", area: "Al Sadd", latitude: 25.269, longitude: 51.523 },
  "al mirqab": { city: "Doha", area: "Al Mirqab", latitude: 25.28, longitude: 51.535 },
  "bin omran": { city: "Doha", area: "Fereej Bin Omran", latitude: 25.299, longitude: 51.511 },
  "al nasr": { city: "Doha", area: "Al Nasr", latitude: 25.285, longitude: 51.508 },
  najma: { city: "Doha", area: "Najma", latitude: 25.296, longitude: 51.5 },
  nuaija: { city: "Doha", area: "Nuaija", latitude: 25.26, longitude: 51.495 },
  "old salata": { city: "Doha", area: "Old Salata", latitude: 25.28, longitude: 51.528 },
  "new salata": { city: "Doha", area: "New Salata / Al Asiri", latitude: 25.26, longitude: 51.515 },
  "al souq": { city: "Doha", area: "Souq Waqif", latitude: 25.2867, longitude: 51.5324 },
  "umm ghuwailina": { city: "Doha", area: "Umm Ghwailina", latitude: 25.275, longitude: 51.545 },
  "al rufaa": { city: "Doha", area: "Other", latitude: 25.29, longitude: 51.526 },
  "al ghanim": { city: "Doha", area: "Old Al Ghanim", latitude: 25.287, longitude: 51.53 },
  "al mansoura": { city: "Doha", area: "Al Mansoura / Fereej Bin Dirham", latitude: 25.265, longitude: 51.525 },
  "al asmakh": { city: "Doha", area: "Other", latitude: 25.288, longitude: 51.534 },
  corniche: { city: "Doha", area: "Al Corniche", latitude: 25.295, longitude: 51.533 },
  "al waab": { city: "Doha", area: "Al Waab / Al Aziziya / New Al Ghanim", latitude: 25.25, longitude: 51.47 },
  "aspire zone": { city: "Doha", area: "Aspire Zone", latitude: 25.26, longitude: 51.448 },
  "al thumama": { city: "Doha", area: "Al Thumama", latitude: 25.23, longitude: 51.52 },
  "al gharrafa": { city: "Doha", area: "Al Gharrafa", latitude: 25.31, longitude: 51.445 },
  "gharrafat al rayyan": { city: "Doha", area: "Other", latitude: 25.305, longitude: 51.435 },
  muaither: { city: "Doha", area: "Muither", latitude: 25.29, longitude: 51.43 },
  "ain khaled": { city: "Doha", area: "Ain Khaled", latitude: 25.245, longitude: 51.47 },
  "abu hamour": { city: "Doha", area: "Abu Hamour", latitude: 25.235, longitude: 51.485 },
  "al maamoura": { city: "Doha", area: "Al Maamoura", latitude: 25.268, longitude: 51.5 },
  "al messila": { city: "Doha", area: "Al Messila", latitude: 25.26, longitude: 51.505 },
  "al markhiya": { city: "Doha", area: "Al Markhiya", latitude: 25.325, longitude: 51.475 },
  "umm lekhba": { city: "Doha", area: "Umm Lekhba", latitude: 25.315, longitude: 51.46 },
  "al duhail": { city: "Doha", area: "Al Duhail", latitude: 25.33, longitude: 51.465 },
  "madinat khalifa": { city: "Doha", area: "Madinat Khalifa North / Dahl Al Hamam", latitude: 25.305, longitude: 51.465 },
  "rawdat al khail": { city: "Doha", area: "Rawdat Al Khail", latitude: 25.27, longitude: 51.49 },
  "al hilal": { city: "Doha", area: "Al Hilal", latitude: 25.26, longitude: 51.495 },
  "al sailiya": { city: "Doha", area: "Al-sailiya", latitude: 25.245, longitude: 51.41 },
  izghawa: { city: "Izghawa", area: "Izghawa", latitude: 25.34, longitude: 51.4 },
  "wadi al banat": { city: "Doha", area: "Other", latitude: 25.25, longitude: 51.46 },
  "al kheesa": { city: "Al Kheesa", area: "Al Kheesa", latitude: 25.36, longitude: 51.37 },
  "al kharaitiyat": { city: "Al Khartiyat", area: "Al Khartiyat", latitude: 25.33, longitude: 51.36 },
  "umm salal mohammed": { city: "Doha", area: "Umsalal Mohammed", latitude: 25.415, longitude: 51.4 },
  "umm salal ali": { city: "Doha", area: "Umm Salal Ali", latitude: 25.405, longitude: 51.395 },
  lusail: { city: "Lusail", area: "Other", latitude: 25.43, longitude: 51.49 },
  "the pearl-qatar": { city: "The Pearl", area: "The Pearl Qatar", latitude: 25.37, longitude: 51.55 },
  "al rayyan": { city: "Doha", area: "Other", latitude: 25.2919, longitude: 51.424 },
  "al rayyan al jadeed": { city: "Doha", area: "Other", latitude: 25.285, longitude: 51.415 },
  "bu hamour": { city: "Doha", area: "Abu Hamour", latitude: 25.235, longitude: 51.485 },
  "al shahaniya": { city: "Al-shahaniya", area: "Other", latitude: 25.37, longitude: 51.22 },
  dukhan: { city: "Dukhan", area: "Other", latitude: 25.4254, longitude: 50.7836 },
  zekreet: { city: "Dukhan", area: "Other", latitude: 25.48, longitude: 50.85 },
  "al wakrah": { city: "Wakrah", area: "Other", latitude: 25.1715, longitude: 51.6034 },
  "al wukair": { city: "Wakrah", area: "Other", latitude: 25.15, longitude: 51.57 },
  mesaieed: { city: "Mesaeidd", area: "Other", latitude: 24.99, longitude: 51.55 },
  "al khor": { city: "Al Khor", area: "Other", latitude: 25.6804, longitude: 51.4971 },
  "al thakhira": { city: "Al Khor", area: "Other", latitude: 25.7, longitude: 51.53 },
  "ras laffan": { city: "Al Khor", area: "Other", latitude: 25.9, longitude: 51.58 },
  simaisma: { city: "Al Khor", area: "Other", latitude: 25.6, longitude: 51.53 },
  "al daayen": { city: "Doha", area: "Other", latitude: 25.55, longitude: 51.48 },
  leabaib: { city: "Doha", area: "Other", latitude: 25.53, longitude: 51.46 },
  "umm qarn": { city: "Doha", area: "Umm Qarn", latitude: 25.51, longitude: 51.44 },
  "madinat ash shamal": { city: "Al Ruwais / Madinat Al Shamal", area: "Other", latitude: 26.12, longitude: 51.21 },
  "al ruwais": { city: "Al Ruwais / Madinat Al Shamal", area: "Other", latitude: 26.14, longitude: 51.22 },
  "al zubarah": { city: "Al Ruwais / Madinat Al Shamal", area: "Other", latitude: 25.98, longitude: 51.03 },
};

// Precinct/community overrides (lib/qatarLocations.ts QATAR_COMMUNITIES_BY_AREA),
// keyed by lowercased community name - checked before AREA_LOCATIONS since a
// precinct is more specific than its parent area.
const COMMUNITY_LOCATIONS: Record<string, QLLocation> = {
  "porto arabia": { city: "The Pearl", area: "Porto Arabia", latitude: 25.368, longitude: 51.545 },
  "viva bahriya": { city: "The Pearl", area: "Viva Bahriya", latitude: 25.373, longitude: 51.552 },
  "qanat quartier": { city: "The Pearl", area: "Qanat Quartier", latitude: 25.365, longitude: 51.55 },
  "medina centrale": { city: "The Pearl", area: "Medina Centrale", latitude: 25.369, longitude: 51.548 },
  "abraj quartier": { city: "The Pearl", area: "Abraj Quartier", latitude: 25.366, longitude: 51.543 },
  "giardino village": { city: "The Pearl", area: "Giardino Village", latitude: 25.376, longitude: 51.553 },
  "floresta gardens": { city: "The Pearl", area: "Floresta Gardens", latitude: 25.378, longitude: 51.554 },
  "isola dana": { city: "The Pearl", area: "Isola Dana", latitude: 25.37, longitude: 51.556 },
  "costa malaz": { city: "The Pearl", area: "Costa Malaz", latitude: 25.371, longitude: 51.547 },
  "fox hills north": { city: "Lusail", area: "Fox Hills", latitude: 25.41, longitude: 51.465 },
  "fox hills south": { city: "Lusail", area: "Fox Hills", latitude: 25.405, longitude: 51.465 },
  "yasmeen city": { city: "Lusail", area: "Al Yasmeen", latitude: 25.425, longitude: 51.475 },
  "lusail marina": { city: "Lusail", area: "Marina", latitude: 25.425, longitude: 51.495 },
  "huzoom lusail": { city: "Lusail", area: "Huzoom Lusail", latitude: 25.435, longitude: 51.5 },
  "al erkyah": { city: "Lusail", area: "Erkiyah", latitude: 25.44, longitude: 51.48 },
  "al qutaifiya": { city: "Lusail", area: "Al Qutaifiya", latitude: 25.445, longitude: 51.47 },
  "al furjan": { city: "Lusail", area: "Other", latitude: 25.42, longitude: 51.46 },
  "energy city": { city: "Lusail", area: "Other", latitude: 25.45, longitude: 51.485 },
  "qetaifan islands": { city: "Lusail", area: "Qetaifan Island", latitude: 25.46, longitude: 51.51 },
};

// Resolves a listing's area/community to Qatar Living's city + area naming
// plus a fallback coordinate. Community is checked first since it's more
// specific (a named precinct); falls back to the area-level entry, then to
// a generic Doha placement if neither is recognised.
export function resolveQatarLivingLocation(area: string, community: string): QLLocation {
  const byCommunity = COMMUNITY_LOCATIONS[community?.toLowerCase()?.trim()];
  if (byCommunity) return byCommunity;

  const byArea = AREA_LOCATIONS[area?.toLowerCase()?.trim()];
  if (byArea) return byArea;

  return DOHA_FALLBACK;
}
