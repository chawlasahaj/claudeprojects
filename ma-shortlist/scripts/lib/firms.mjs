// Managing agent names arrive spelt many ways ("ABC PROPERTY MGT PTE. LTD.", "ABC Property
// Management Pte Ltd"). firmKey() reduces each to one comparable key; ma-aliases.json covers
// renames and spellings the rules can't catch.

const DROP = new Set(["PTE", "LTD", "PRIVATE", "LIMITED", "LLP", "LLC", "INC", "BHD", "SDN", "S", "THE"]);
const EXPAND = {
  MGT: "MANAGEMENT",
  MGMT: "MANAGEMENT",
  MANAGT: "MANAGEMENT",
  MNGT: "MANAGEMENT",
  MGNT: "MANAGEMENT",
  SVC: "SERVICES",
  SVCS: "SERVICES",
  SERVICE: "SERVICES",
  CONSULTANT: "CONSULTANTS",
  INTL: "INTERNATIONAL",
  PROPS: "PROPERTIES",
};

export function firmKey(raw) {
  const words = String(raw ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => EXPAND[w] ?? w)
    .filter((w) => !DROP.has(w));
  return words.join(" ");
}

export const slug = (key) => key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const SMALL = new Set(["AND", "OF", "THE", "FOR"]);
const CASED = { PTE: "Pte", LTD: "Ltd", LLP: "LLP", "(S)": "(S)" };

// "SAVILLS PROPERTY MANAGEMENT PTE LTD" -> "Savills Property Management Pte Ltd".
// Likely acronyms stay in capitals: no vowels, or up to 4 letters with at most one vowel
// (CBRE, JLL, SRE, IFM). Anything else odd goes in ma-aliases.json "display".
export function displayName(raw) {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (s !== s.toUpperCase()) return s; // Already mixed case: trust it.
  return s
    .split(" ")
    .map((w, i) => {
      const bare = w.replace(/[^A-Z]/g, "");
      if (CASED[bare]) return w.replace(bare, CASED[bare]);
      if (i > 0 && SMALL.has(bare)) return w.toLowerCase();
      const vowels = (bare.match(/[AEIOUY]/g) ?? []).length;
      if (vowels === 0 || (bare.length <= 4 && vowels <= 1)) return w;
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(" ");
}

// Builds a resolver from ma-aliases.json: raw name -> { id, key } or null when the name isn't a firm.
// The file may use raw spellings or keys on either side; both are reduced with firmKey().
export function makeResolver(aliases = {}) {
  const merge = Object.fromEntries(Object.entries(aliases.merge ?? {}).map(([from, to]) => [firmKey(from), firmKey(to)]));
  const notFirm = new Set((aliases.notFirm ?? []).map(firmKey));
  return (raw) => {
    let key = firmKey(raw);
    if (!key || notFirm.has(key)) return null;
    const seen = new Set();
    while (merge[key] && !seen.has(key)) {
      seen.add(key);
      key = merge[key];
    }
    return { key, id: slug(key) };
  };
}
