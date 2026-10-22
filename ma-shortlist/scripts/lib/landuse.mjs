// What kind of development each MCST is: homes, mixed use, offices and shops, or industrial.
// BCA's list doesn't say, so we read URA's Master Plan land-use zone at the development's
// postal code and fall back to words in its name. See the Methodology page.

import fs from "node:fs";

// URA land-use descriptions (LU_DESC) → our types, first match wins. Zones that aren't
// buildings people own strata units in (roads, parks, schools…) map to nothing.
const ZONES = [
  [/^BUSINESS PARK/, "commercial"],
  [/^BUSINESS [12]/, "industrial"], // B1 light and B2 general industry, and their "- WHITE" versions
  [/^COMMERCIAL (&|AND) RESIDENTIAL|^RESIDENTIAL WITH COMMERCIAL|^WHITE/, "mixed"],
  [/^RESIDENTIAL/, "home"],
  [/^COMMERCIAL|^HOTEL/, "commercial"],
];

export const normLu = (s) =>
  s == null ? null : String(s).replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().toUpperCase() || null;

export function zoneUse(lu) {
  lu = normLu(lu);
  if (!lu) return null;
  return ZONES.find(([re]) => re.test(lu))?.[1] ?? null;
}

const NAMES = [
  [/\b(INDUSTRIAL|INDUSTRIES|INDUSTRY|FACTORY|WAREHOUSE|LOGISTICS?|WORKSHOP|DISTRIPARK|FOOD ?LINK|TECH ?PARK|TECHPLACE|TECHVIEW|TECHNOPARK)\b/, "industrial"],
  [/\b(RESIDENCES?|CONDOMINIUM|CONDO|APARTMENTS?|SUITES|VILLAS?|MANSIONS?|LOFTS?|TOWNHOUSES?|HOMES)\b/, "home"],
  [/\b(BUILDING|TOWERS?|PLAZA|CENTRE|CENTER|MALL|SHOPPING|COMPLEX|OFFICES?|ARCADE|HOTEL|CHAMBERS|EXCHANGE)\b/, "commercial"],
];

export function nameUse(name) {
  const n = String(name ?? "").toUpperCase();
  return NAMES.find(([re]) => re.test(n))?.[1] ?? null;
}

/**
 * @param name  the development's name
 * @param zone  from landuse-cache.json: { lu, near } (near: the zone around it, when lu isn't a building zone)
 * @returns     { use: "home"|"mixed"|"commercial"|"industrial"|null, by: "zone"|"name"|null }
 */
export function classify(name, zone) {
  const fromZone = zone ? (zoneUse(zone.lu) ?? zoneUse(zone.near)) : null;
  const fromName = nameUse(name);
  if (fromZone === "home") return { use: "home", by: "zone" };
  // A name like "Residences" or "Condominium" keeps a development with homes, whatever the land
  // around its map point is zoned for; offices and towers on mixed-use land go by their name too.
  if (fromZone === "industrial") return { use: fromName === "home" ? "home" : "industrial", by: "zone" };
  if (fromZone === "commercial") return { use: fromName === "home" ? "mixed" : "commercial", by: "zone" };
  if (fromZone === "mixed") return { use: fromName === "home" || fromName === "commercial" ? fromName : "mixed", by: "zone" };
  return fromName ? { use: fromName, by: "name" } : { use: null, by: null };
}

// ---- Reading URA's GeoJSON ----

// LU_DESC from a feature's properties. data.gov.sg layers converted from KML keep the
// attributes in an HTML table in "Description" instead.
export function luDesc(props = {}) {
  const direct = props.LU_DESC ?? props.lu_desc;
  if (direct) return normLu(direct);
  const m = /LU_DESC\s*<\/th>\s*<td>([^<]*)<\/td>/i.exec(props.Description ?? props.description ?? "");
  return m ? normLu(m[1]) : null;
}

// Calls onFeature for each object in the top-level "features" array, reading the file in
// chunks so the whole layer never has to sit in memory as one string.
export async function eachFeature(file, onFeature, { chunkSize = 1 << 20 } = {}) {
  const stack = [];
  let inString = false;
  let escaped = false;
  let parts = null;
  for await (const chunk of fs.createReadStream(file, { encoding: "utf8", highWaterMark: chunkSize })) {
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "{" || c === "[") {
        if (c === "{" && stack.length === 2 && stack[0] === "{" && stack[1] === "[") {
          parts = [];
          start = i;
        }
        stack.push(c);
      } else if (c === "}" || c === "]") {
        stack.pop();
        if (parts && stack.length === 2) {
          parts.push(chunk.slice(start, i + 1));
          onFeature(JSON.parse(parts.join("")));
          parts = null;
        }
      }
    }
    if (parts) parts.push(chunk.slice(start));
  }
}

// Even-odd ray casting, so holes in a polygon count as outside.
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (x, y, rings) => rings.reduce((inside, ring) => (inRing(x, y, ring) ? !inside : inside), false);

export function inGeometry(lng, lat, g) {
  if (!g) return false;
  if (g.type === "Polygon") return inPolygon(lng, lat, g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some((p) => inPolygon(lng, lat, p));
  if (g.type === "GeometryCollection") return g.geometries.some((h) => inGeometry(lng, lat, h));
  return false;
}

// [minLng, minLat, maxLng, maxLat]
export function bbox(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === "number") {
      b[0] = Math.min(b[0], c[0]);
      b[1] = Math.min(b[1], c[1]);
      b[2] = Math.max(b[2], c[0]);
      b[3] = Math.max(b[3], c[1]);
    } else c.forEach(walk);
  };
  if (g?.type === "GeometryCollection") g.geometries.forEach((h) => walk(h.coordinates));
  else if (g?.coordinates) walk(g.coordinates);
  return b;
}

// A grid of points, so each zone is only tested against the points near it.
export function pointGrid(points, cell = 0.005) {
  const cells = new Map();
  points.forEach((p, i) => {
    const k = `${Math.floor(p.lng / cell)},${Math.floor(p.lat / cell)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  });
  return {
    *within([minLng, minLat, maxLng, maxLat]) {
      for (let x = Math.floor(minLng / cell); x <= Math.floor(maxLng / cell); x++) {
        for (let y = Math.floor(minLat / cell); y <= Math.floor(maxLat / cell); y++) {
          for (const i of cells.get(`${x},${y}`) ?? []) yield i;
        }
      }
    },
  };
}

// The point itself, then rings at 30 m and 60 m. A postal code's map point sometimes lands on
// the road or open space beside the building; the rings find the zone next to it.
const RINGS = [30, 60];
export function samplePoints(lat, lng) {
  const out = [{ lat, lng, ring: 0 }];
  const perDegLat = 110574;
  const perDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  RINGS.forEach((m, r) => {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      out.push({ lat: lat + (m * Math.sin(a)) / perDegLat, lng: lng + (m * Math.cos(a)) / perDegLng, ring: r + 1 });
    }
  });
  return out;
}

// From the zones found at each sample point, the cache entry for one postal code.
export function zoneFromSamples(samples) {
  const centre = samples.find((s) => s.ring === 0)?.lu ?? null;
  if (zoneUse(centre)) return { lu: centre };
  for (let ring = 1; ring <= RINGS.length; ring++) {
    const near = mostCommon(samples.filter((s) => s.ring === ring && zoneUse(s.lu)).map((s) => s.lu));
    if (near) return { lu: centre, near };
  }
  return { lu: centre };
}

function mostCommon(values) {
  const n = {};
  for (const v of values) n[v] = (n[v] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
