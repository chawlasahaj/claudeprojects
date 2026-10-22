// Turns BCA's MCST rows into one tidy shape, whatever the column names are this month.
// The CSV download uses prefixed names (usr_mcno, mcst_stratalota, managementname), while
// data.gov.sg's preview shows titles ("MCST No", "Managing Agent Name"), so columns are
// matched loosely.

const COLUMNS = {
  mcst: ["mcstno", "mcstnumber", "usrmcno", "mcno", "mcst"],
  sub: ["submcstno", "submcno", "submcst"],
  type: ["mctype", "mcsttype"],
  uen: ["uen", "usrmcstuen", "mcstuen"],
  name: ["developmentname", "development", "devtname", "mcstdevtname", "mcstname"],
  address: ["developmentlocation", "address", "mcstaddress", "location", "devtlocation"],
  postal: ["postalcode", "mcstpostalcode", "postal", "postcode"],
  tel: ["mccontactno", "managementtelno", "mgttelno", "mcsttelno", "contactno", "telno"],
  status: ["status", "mcststatus", "mcstatus"],
  lots: ["stratalots", "mcststratalota", "stratalota", "noofstratalots", "numberofstratalots", "lots", "units"],
  ma: ["managingagentname", "managementname", "managingagent", "maname", "mcstmaname", "managingagentcompany"],
  houseNo: ["mcsthouseno", "houseno", "blkno"],
  road: ["mcstroadname", "roadname", "streetname"],
  building: ["mcstbuildingname", "buildingname"],
  constituted: ["dateofmcconstitution", "mcformdate", "dateofconstitution", "constitutiondate", "mcconstitutiondate"],
};
const REQUIRED = ["mcst", "name", "postal", "ma"];

const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Maps our field names to the dataset's column names. Throws if a required one is missing.
export function mapColumns(headers) {
  const byKey = new Map(headers.map((h) => [squash(h), h]));
  const map = {};
  for (const [field, candidates] of Object.entries(COLUMNS)) {
    const exact = candidates.find((c) => byKey.has(c));
    if (exact) {
      map[field] = byKey.get(exact);
      continue;
    }
    // Fall back to the first header that contains a candidate, e.g. "managing_agent_name_1".
    const loose = headers.find((h) => candidates.some((c) => c.length > 4 && squash(h).includes(c)));
    if (loose) map[field] = loose;
  }
  const missing = REQUIRED.filter((f) => !map[f]);
  if (missing.length) {
    throw new Error(`Could not find columns for ${missing.join(", ")}. Headers were: ${headers.join(" | ")}`);
  }
  return map;
}

const NO_AGENT = /^(|-+|nil|na|n\.?a\.?|none|null|not applicable|no managing agent|no ma|self[- ]?managed|tbc|tba)$/i;
const INACTIVE = /terminat|dissolv|inactive|wound|cancel|ceased|struck/i;

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

export function normaliseRow(raw, map) {
  const get = (f) => (map[f] ? clean(raw[map[f]]) : "");
  const mcst = get("mcst").replace(/\.0$/, "");
  const sub = get("sub").replace(/\.0$/, "");
  const isSub = sub !== "" && !/^(0|-|nil|na)$/i.test(sub);
  const ma = get("ma");
  const lots = parseInt(get("lots").replace(/[^0-9]/g, ""), 10);
  // BCA's postal code column is the MCST's correspondence address, often its managing agent's
  // office. The development's own postal code ends its address: "557 UPPER THOMSON ROAD 574418".
  const location = get("address");
  const ownPostal = /(?:^|\D)(\d{5,6})\s*$/.exec(location)?.[1];
  const postal = (ownPostal ?? get("postal").replace(/[^0-9]/g, "")).padStart(6, "0");
  return {
    key: isSub ? `${mcst}-${sub}` : mcst,
    mcst,
    sub: isSub ? sub : "",
    type: get("type"),
    uen: get("uen"),
    name: get("name"),
    address: location || [[get("houseNo"), get("road")].filter(Boolean).join(" "), get("building")].filter(Boolean).join(", "),
    postal: /^0+$/.test(postal) ? "" : postal,
    tel: get("tel"),
    status: get("status"),
    lots: Number.isFinite(lots) && lots > 0 ? lots : null,
    ma: NO_AGENT.test(ma) ? "" : ma,
    constituted: get("constituted"),
  };
}

export const isActive = (row) => !INACTIVE.test(row.status);
export const isSubMc = (row) => row.sub !== "" || /\bsub\b/i.test(row.type);

// Parses a whole table and drops rows with no MCST number.
export function normaliseTable(objects) {
  if (!objects.length) return { rows: [], map: {} };
  const map = mapColumns(Object.keys(objects[0]));
  const rows = objects.map((o) => normaliseRow(o, map)).filter((r) => r.mcst);
  return { rows, map };
}
