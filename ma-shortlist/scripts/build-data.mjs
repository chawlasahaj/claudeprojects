// Builds the JSON the site loads from the saved data:
//   web/data/mcst.json    every active MCST with its coordinates, type and managing agent
//   web/data/agents.json  every managing agent: portfolio, types, districts, accreditation, switches
//   web/data/meta.json    dates, counts and sources
//
//   node scripts/build-data.mjs [--data <dir>] [--out <dir>] [--aliases <file>] [--accreditation <file>]

import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, readJson, writeJson } from "./lib/io.mjs";
import { isActive, isSubMc } from "./lib/rows.mjs";
import { makeResolver, displayName, firmKey } from "./lib/firms.mjs";
import { diffHistory } from "./lib/history.mjs";
import { classify } from "./lib/landuse.mjs";
import { postalDistrict } from "../web/lib/geo.js";

const MCST_COLS = ["key", "mcst", "name", "address", "postal", "lat", "lng", "lots", "firm", "tel", "use"];
const USES = ["home", "mixed", "commercial", "industrial"];

export function build({ current, history, geocodes, aliases, accreditation, landuse = {} }) {
  const resolve = makeResolver(aliases);
  const rows = current.rows.filter((r) => isActive(r) && !isSubMc(r));
  const displayOverrides = Object.fromEntries(Object.entries(aliases.display ?? {}).map(([k, v]) => [firmKey(k), v]));

  const firms = new Map();
  const mcsts = [];
  const classifiedBy = { zone: 0, name: 0 };
  for (const r of rows) {
    const f = r.ma ? resolve(r.ma) : null;
    const [lat, lng] = geocodes[r.postal] ?? [null, null];
    const { use, by } = classify(r.name, landuse.zones?.[r.postal]);
    if (by) classifiedBy[by]++;
    mcsts.push({ key: r.key, mcst: r.mcst, name: r.name, address: r.address, postal: r.postal, lat, lng, lots: r.lots, firm: f?.id ?? null, tel: r.tel, use });
    if (!f) continue;
    if (!firms.has(f.id)) firms.set(f.id, { id: f.id, key: f.key, spellings: {}, count: 0, units: 0, byUse: Object.fromEntries(USES.map((u) => [u, 0])), districts: {} });
    const firm = firms.get(f.id);
    firm.count++;
    firm.units += r.lots ?? 0;
    if (use) firm.byUse[use]++;
    firm.spellings[r.ma] = (firm.spellings[r.ma] ?? 0) + 1;
    const d = postalDistrict(r.postal);
    if (d) firm.districts[d] = (firm.districts[d] ?? 0) + 1;
  }

  // Accreditation: match listed names to firms the same way as the BCA names.
  const accredited = new Map();
  const unmatchedAccreditation = [];
  for (const a of accreditation.firms ?? []) {
    const f = resolve(a.name);
    if (f && firms.has(f.id)) accredited.set(f.id, { category: a.category ?? null, phone: a.phone ?? null });
    else unmatchedAccreditation.push(a.name);
  }

  // History: the earliest snapshot that shares most MCST numbers with the latest, so a
  // snapshot keyed differently can't make every development look new.
  const snaps = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const latest = snaps.at(-1);
  const overlap = (s) => {
    const keys = Object.keys(latest.agents);
    return keys.filter((k) => k in s.agents).length / Math.max(1, keys.length);
  };
  const earliest = snaps.slice(0, -1).find((s) => overlap(s) >= 0.5);
  const skipped = snaps.slice(0, -1).filter((s) => overlap(s) < 0.5).map((s) => s.date);
  const diff = earliest ? diffHistory(earliest, latest, resolve) : null;

  const agents = [...firms.values()]
    .map((f) => {
      const spellings = Object.entries(f.spellings).sort((a, b) => b[1] - a[1]);
      const h = diff?.perFirm[f.id];
      return {
        id: f.id,
        name: displayOverrides[f.key] ?? nameFor(spellings.map(([sp]) => sp)),
        spellings: spellings.map(([s]) => s),
        count: f.count,
        units: f.units,
        byUse: f.byUse,
        districts: f.districts,
        accredited: accredited.get(f.id) ?? null,
        history: h ? { startCount: h.startCount, gained: h.gained, lost: h.lost, newDevelopments: h.newDevelopments } : null,
        moves: h ? { in: h.in, out: h.out } : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  mcsts.sort((a, b) => a.name.localeCompare(b.name));
  const meta = {
    builtAt: new Date().toISOString(),
    source: current.source,
    fetchedAt: current.fetchedAt,
    counts: {
      rows: current.rows.length,
      mcsts: mcsts.length,
      firms: agents.length,
      noAgent: mcsts.filter((m) => !m.firm).length,
      located: mcsts.filter((m) => m.lat != null).length,
      withLots: mcsts.filter((m) => m.lots).length,
    },
    history: diff ? { since: diff.since, until: diff.until, switches: diff.switches, snapshots: snaps.length } : null,
    // Types are only offered as a filter once URA's zoning has been read.
    landUse: classifiedBy.zone
      ? {
          source: landuse.title ?? null,
          dataset: landuse.dataset ?? null,
          checked: landuse.checked ?? null,
          byZone: classifiedBy.zone,
          byName: classifiedBy.name,
          counts: Object.fromEntries([...USES, null].map((u) => [u ?? "unknown", mcsts.filter((m) => m.use === u).length])),
        }
      : null,
    accreditation: {
      source: accreditation.source ?? null,
      checked: accreditation.checked ?? null,
      complete: !!accreditation.complete,
      listed: (accreditation.firms ?? []).length,
      matched: accredited.size,
    },
  };

  return {
    meta,
    agents,
    mcst: { cols: MCST_COLS, rows: mcsts.map((m) => MCST_COLS.map((c) => m[c] ?? null)) },
    report: { unmatchedAccreditation, nearDuplicates: nearDuplicates(agents), skippedSnapshots: skipped },
  };
}

// The most common spelling, but if it's in capitals and BCA also has the same name in mixed
// case ("Jones Lang LaSalle"), use that rather than our guess at the casing.
export function nameFor(spellings) {
  const top = spellings[0];
  if (top !== top.toUpperCase()) return top;
  return spellings.find((sp) => sp !== sp.toUpperCase() && sp.toUpperCase() === top) ?? displayName(top);
}

// Firms whose first two words match: candidates for ma-aliases.json "merge".
function nearDuplicates(agents) {
  const groups = {};
  for (const a of agents) {
    const stem = a.id.split("-").slice(0, 2).join("-");
    (groups[stem] ??= []).push(`${a.name} (${a.count})`);
  }
  return Object.values(groups).filter((g) => g.length > 1);
}

function readHistory(dir) {
  const histDir = path.join(dir, "history");
  if (!fs.existsSync(histDir)) return [];
  return fs
    .readdirSync(histDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => readJson(path.join(histDir, f)));
}

function main() {
  const args = parseArgs();
  const dir = path.resolve(args.data ?? path.join(ROOT, "data"));
  const out = path.resolve(args.out ?? path.join(ROOT, "web", "data"));
  const currentFile = path.join(dir, "current.json");
  if (!fs.existsSync(currentFile)) {
    console.log(`No ${path.relative(ROOT, currentFile)} yet: run scripts/fetch-mcst.mjs first. Nothing built.`);
    return;
  }
  const result = build({
    current: readJson(currentFile),
    history: readHistory(dir),
    geocodes: readJson(path.join(dir, "geocode-cache.json"), {}),
    aliases: readJson(args.aliases ?? path.join(dir, "ma-aliases.json"), {}),
    accreditation: readJson(args.accreditation ?? path.join(dir, "accreditation.json"), {}),
    landuse: readJson(path.join(dir, "landuse-cache.json"), {}),
  });

  writeJson(path.join(out, "meta.json"), result.meta);
  writeJson(path.join(out, "agents.json"), result.agents, { pretty: false });
  writeJson(path.join(out, "mcst.json"), result.mcst, { pretty: false });

  const { meta, agents, report } = result;
  console.log(`Built ${meta.counts.mcsts} MCSTs, ${meta.counts.firms} managing agents (${meta.counts.noAgent} MCSTs with none listed).`);
  console.log(`Located ${meta.counts.located}/${meta.counts.mcsts}; strata lots known for ${meta.counts.withLots}.`);
  if (meta.landUse) {
    const lu = meta.landUse;
    console.log(`Types (${lu.byZone} from URA zoning, ${lu.byName} from the name): ${Object.entries(lu.counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    const unknown = result.mcst.rows.filter((r) => r[result.mcst.cols.indexOf("use")] == null).map((r) => r[result.mcst.cols.indexOf("name")]);
    if (unknown.length) console.log(`  Type unknown, e.g.: ${unknown.slice(0, 30).join("; ")}`);
  } else console.log("Types: no land-use zones yet (run scripts/landuse.mjs), so no type filter.");
  console.log(meta.history ? `History ${meta.history.since} → ${meta.history.until}: ${meta.history.switches} switches.` : "History: only one snapshot so far.");
  console.log(`Accreditation: ${meta.accreditation.matched}/${meta.accreditation.listed} listed firms matched (complete: ${meta.accreditation.complete}).`);
  if (report.skippedSnapshots.length) console.log(`Ignored history snapshots that share too few MCST numbers with today's: ${report.skippedSnapshots.join(", ")}`);
  if (report.unmatchedAccreditation.length) console.log("  Not matched to a BCA name:", report.unmatchedAccreditation.join("; "));
  console.log("Largest:", agents.slice(0, 15).map((a) => `${a.name} ${a.count}`).join(", "));
  const multi = agents.filter((a) => a.spellings.length > 1);
  if (multi.length) console.log(`${multi.length} firms appear under more than one spelling (merged automatically).`);
  if (report.nearDuplicates.length) {
    console.log("Possible duplicates to check in data/ma-aliases.json:");
    for (const g of report.nearDuplicates.slice(0, 40)) console.log(`  ${g.join("  |  ")}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
