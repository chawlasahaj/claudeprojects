// Distances and Singapore postal districts.

const R_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function distanceKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

// URA's postal districts, keyed by the first two digits of the postal code (the sector).
const DISTRICT_SECTORS = {
  1: "01 02 03 04 05 06", 2: "07 08", 3: "14 15 16", 4: "09 10", 5: "11 12 13", 6: "17",
  7: "18 19", 8: "20 21", 9: "22 23", 10: "24 25 26 27", 11: "28 29 30", 12: "31 32 33",
  13: "34 35 36 37", 14: "38 39 40 41", 15: "42 43 44 45", 16: "46 47 48", 17: "49 50 81",
  18: "51 52", 19: "53 54 55 82", 20: "56 57", 21: "58 59", 22: "60 61 62 63 64",
  23: "65 66 67 68", 24: "69 70 71", 25: "72 73", 26: "77 78", 27: "75 76", 28: "79 80",
};
const SECTOR_TO_DISTRICT = {};
for (const [d, sectors] of Object.entries(DISTRICT_SECTORS)) {
  for (const s of sectors.split(" ")) SECTOR_TO_DISTRICT[s] = Number(d);
}

export const DISTRICT_NAMES = {
  1: "Raffles Place, Marina", 2: "Tanjong Pagar, Chinatown", 3: "Queenstown, Tiong Bahru",
  4: "Harbourfront, Telok Blangah", 5: "Clementi, West Coast", 6: "City Hall, Clarke Quay",
  7: "Bugis, Beach Road", 8: "Little India, Farrer Park", 9: "Orchard, River Valley",
  10: "Bukit Timah, Holland, Tanglin", 11: "Novena, Newton, Thomson", 12: "Balestier, Toa Payoh",
  13: "Macpherson, Potong Pasir", 14: "Geylang, Eunos, Paya Lebar", 15: "Katong, Marine Parade, Joo Chiat",
  16: "Bedok, Upper East Coast", 17: "Changi, Loyang", 18: "Tampines, Pasir Ris",
  19: "Serangoon, Hougang, Punggol, Sengkang", 20: "Bishan, Ang Mo Kio", 21: "Upper Bukit Timah, Clementi Park",
  22: "Jurong, Boon Lay", 23: "Bukit Batok, Bukit Panjang, Choa Chu Kang", 24: "Lim Chu Kang, Tengah",
  25: "Kranji, Woodlands", 26: "Upper Thomson, Springleaf", 27: "Yishun, Sembawang", 28: "Seletar, Yio Chu Kang",
};

export function postalDistrict(postal) {
  const sector = String(postal ?? "").padStart(6, "0").slice(0, 2);
  return SECTOR_TO_DISTRICT[sector] ?? null;
}

export function districtLabel(d) {
  return d ? `D${String(d).padStart(2, "0")} ${DISTRICT_NAMES[d] ?? ""}`.trim() : "Unknown district";
}

// Distance between two places, or null when either has no coordinates.
export function between(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  return distanceKm(a.lat, a.lng, b.lat, b.lng);
}
