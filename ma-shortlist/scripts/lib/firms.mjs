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
    .replace(/\(\s*S(INGAPORE)?\s*\)/g, " ") // "(S)" and "(Singapore)" name the same firm
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
const CASED = { LTD: "Ltd", PTE: "Pte" };
// Acronyms seen in BCA's list that contain a vowel (ones without vowels stay in capitals anyway).
const ACRONYMS = new Set(["CBRE", "SRE", "IFM", "OIFM", "AGM", "HBA", "LE", "AV", "YTC", "YTL", "PIP", "MCS", "ANB", "UE", "UOL", "IK", "AMPM", "RIM", "TRI", "FECC", "IMSV", "MCST", "ES", "PFS"]);

// "SAVILLS PROPERTY MANAGEMENT PTE. LTD." -> "Savills Property Management Pte. Ltd.".
// Each run of letters is cased on its own, so "D'PROMAN", "HOE-TAN" and "PTE.LTD." come out
// right. Single letters, known acronyms and words without vowels (JLL, CWL) stay in capitals.
// Anything still odd goes in ma-aliases.json "display".
export function displayName(raw) {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (s !== s.toUpperCase()) return s; // Already mixed case: trust it.
  let first = true;
  return s.replace(/[A-Z]+/g, (w, at) => {
    const isFirst = first;
    first = false;
    if (CASED[w]) return CASED[w];
    if (w.length === 1 || ACRONYMS.has(w) || !/[AEIOU]/.test(w)) return w;
    if (!isFirst && SMALL.has(w) && s[at - 1] === " ") return w.toLowerCase();
    return w[0] + w.slice(1).toLowerCase();
  });
}

// Words that show a name belongs to a business. Entries without one are people's names,
// "MCST" (self-managed) or placeholders like "N", and are not shown as managing agents.
const BUSINESS = /\b(PTE|LTD|LLP|LLC|INC|BHD|MANAGEMENTS?|MGT|MGMT|PROPERTY|PROPERTIES|PROP|SERVICES?|SERVICECORP|CONSULT\w*|ESTATES?|STRATA|REALTY|FACILIT\w*|ASSETS?|INTERNATIONAL|GROUP|HOLDINGS?|SOLUTIONS?|ENTERPRISES?|CO|COMPANY|CORP\w*|ASSOCIATES|VENTURES|INNOVATIONS?|INVESTMENTS?|DEVELOPMENTS?|CONSTRUCTION|ENGINEERING|INSURANCE|HOTEL|HOSPITALS?|SUPPLY|VALUERS?|MARKETING|PARTNERS|RESOURCES?|APPRAISAL|BUILDINGS?|BROTHERS|TRADING|AGENCY|AGENT|MANAGING|RETAIL|LAND|REAL)\b/;
export const looksLikeFirm = (raw) => BUSINESS.test(String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " "));

// Builds a resolver from ma-aliases.json: raw name -> { id, key } or null when the name isn't a firm.
// The file may use raw spellings or keys on either side; both are reduced with firmKey().
export function makeResolver(aliases = {}) {
  const merge = Object.fromEntries(Object.entries(aliases.merge ?? {}).map(([from, to]) => [firmKey(from), firmKey(to)]));
  const notFirm = new Set((aliases.notFirm ?? []).map(firmKey));
  return (raw) => {
    let key = firmKey(raw);
    if (!key || notFirm.has(key) || !looksLikeFirm(raw)) return null;
    const seen = new Set();
    while (merge[key] && !seen.has(key)) {
      seen.add(key);
      key = merge[key];
    }
    return { key, id: slug(key) };
  };
}
