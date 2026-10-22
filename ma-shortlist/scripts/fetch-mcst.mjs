// Downloads BCA's list of MCSTs from data.gov.sg and saves it in a tidy shape.
//
//   node scripts/fetch-mcst.mjs                     latest data -> data/current.json + data/history/<today>.json
//   node scripts/fetch-mcst.mjs --csv file.csv      use a local CSV instead of downloading
//   node scripts/fetch-mcst.mjs --history-only --dataset <id> --date 2024-08-31
//                                                   save another dataset only as a dated history snapshot
// Options: --data <dir> (default data), --date YYYY-MM-DD (default today).

import fs from "node:fs";
import path from "node:path";
import { csvToObjects } from "./lib/csv.mjs";
import { normaliseTable, isActive, isSubMc } from "./lib/rows.mjs";
import { sameAgents } from "./lib/history.mjs";
import { ROOT, parseArgs, readJson, writeJson, fetchRetry, sleep, today } from "./lib/io.mjs";
import { getJson, downloadUrl, metadata } from "./lib/datagov.mjs";

export const DATASET = "d_1f9391a2f1476cdaf4f05a8d3a05c257";

async function downloadCsv(id) {
  const buf = Buffer.from(await (await fetchRetry(await downloadUrl(id))).arrayBuffer());
  // Some BCA datasets download as Excel files (a zip, starting "PK"); those go through the datastore API.
  if (buf.subarray(0, 2).toString() === "PK") throw new Error("the download is an Excel file, not a CSV");
  return buf.toString("utf8");
}

// Fallback: page through the CKAN datastore API.
async function datastoreObjects(id) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const j = await getJson(`https://data.gov.sg/api/action/datastore_search?resource_id=${id}&limit=1000&offset=${offset}`);
    const records = j?.result?.records ?? [];
    out.push(...records.map(({ _id, ...r }) => r));
    if (records.length < 1000 || out.length >= (j.result.total ?? Infinity)) return out;
    await sleep(1500);
  }
}

async function loadObjects(args, id) {
  if (args.csv) return csvToObjects(fs.readFileSync(args.csv, "utf8"));
  try {
    return csvToObjects(await downloadCsv(id));
  } catch (e) {
    console.warn(`CSV download failed (${e.message}); trying the datastore API`);
    return datastoreObjects(id);
  }
}

const tally = (rows, f) => rows.reduce((m, r) => ((m[f(r) || "(blank)"] = (m[f(r) || "(blank)"] ?? 0) + 1), m), {});

// Who manages each active, top-level MCST: the part of a snapshot that history needs.
export const agentsOf = (rows) => Object.fromEntries(rows.filter((r) => isActive(r) && !isSubMc(r)).map((r) => [r.key, r.ma]));

// Saves a dated history snapshot unless the previous one is identical. Returns the file written, if any.
export function saveHistory(dir, date, agents, { overwrite = true } = {}) {
  const histDir = path.join(dir, "history");
  fs.mkdirSync(histDir, { recursive: true });
  const file = path.join(histDir, `${date}.json`);
  if (!overwrite && fs.existsSync(file)) return null;
  const earlier = fs
    .readdirSync(histDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${date}.json`)
    .sort();
  const prev = earlier.length ? readJson(path.join(histDir, earlier.at(-1))) : null;
  if (prev && sameAgents(prev.agents, agents)) return null;
  writeJson(file, { date, agents }, { pretty: false });
  return file;
}

async function main() {
  const args = parseArgs();
  const id = args.dataset ?? DATASET;
  const dir = path.resolve(args.data ?? path.join(ROOT, "data"));
  const meta = args.csv ? { title: null, updated: null, coverageEnd: null } : await metadata(id);

  const objects = await loadObjects(args, id);
  const { rows, map } = normaliseTable(objects);
  console.log(`Dataset ${id}: ${rows.length} rows`);
  console.log("Columns used:", JSON.stringify(map));
  console.log("Status:", JSON.stringify(tally(rows, (r) => r.status)));
  console.log("MC type:", JSON.stringify(tally(rows, (r) => r.type)));
  const active = rows.filter((r) => isActive(r) && !isSubMc(r));
  console.log(`Active top-level MCSTs: ${active.length}; with no managing agent: ${active.filter((r) => !r.ma).length}; with strata lots: ${active.filter((r) => r.lots).length}`);
  if (rows.length < 100 && !args.csv) throw new Error("Suspiciously few rows; not saving");

  if (args["history-only"]) {
    const date = args.date ?? (meta.coverageEnd ?? meta.updated ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--history-only needs --date YYYY-MM-DD (metadata had no date)");
    const file = saveHistory(dir, date, agentsOf(rows), { overwrite: false });
    console.log(file ? `Saved ${path.relative(ROOT, file)}` : `History for ${date} already exists or is unchanged`);
    return;
  }

  const date = args.date ?? today();
  writeJson(path.join(dir, "current.json"), {
    source: { id, title: meta.title, url: `https://data.gov.sg/datasets/${id}/view`, updated: meta.updated },
    fetchedAt: date,
    columns: map,
    rows,
  });
  const file = saveHistory(dir, date, agentsOf(rows));
  console.log(file ? `Saved history ${path.relative(ROOT, file)}` : "Who-manages-what is unchanged since the last snapshot");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
