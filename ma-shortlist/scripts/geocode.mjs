// Looks up the coordinates of each MCST's postal code with OneMap's public search and caches
// them in data/geocode-cache.json, so later runs only look up new postal codes.
//
//   node scripts/geocode.mjs [--data <dir>] [--limit N] [--max-minutes N] [--retry-missing]
//
// --max-minutes stops cleanly when time is up; the next run carries on from the cache.

import path from "node:path";
import { ROOT, parseArgs, readJson, writeJson, fetchRetry, sleep } from "./lib/io.mjs";
import { isActive, isSubMc } from "./lib/rows.mjs";

// OneMap allows about 250 calls a minute.
const PAUSE_MS = 300;

export async function lookup(postal) {
  const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postal}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const j = await (await fetchRetry(url, {}, 3)).json();
  const results = j?.results ?? [];
  const hit = results.find((r) => r.POSTAL === postal) ?? null;
  if (!hit) return null;
  const lat = Number(hit.LATITUDE);
  const lng = Number(hit.LONGITUDE);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5] : null;
}

async function main() {
  const args = parseArgs();
  const dir = path.resolve(args.data ?? path.join(ROOT, "data"));
  const cacheFile = path.join(dir, "geocode-cache.json");
  const cache = readJson(cacheFile, {});
  const { rows } = readJson(path.join(dir, "current.json"));

  const postals = [...new Set(rows.filter((r) => isActive(r) && !isSubMc(r) && r.postal).map((r) => r.postal))];
  const todo = postals.filter((p) => !(p in cache) || (args["retry-missing"] && cache[p] === null));
  const limit = Number(args.limit ?? Infinity);
  console.log(`${postals.length} postal codes, ${todo.length} to look up`);

  const budgetMs = Number(args["max-minutes"] ?? Infinity) * 60000;
  const started = Date.now();
  let done = 0;
  let found = 0;
  let failedInARow = 0;
  for (const p of todo.slice(0, limit)) {
    if (Date.now() - started > budgetMs) {
      console.log(`Out of time after ${args["max-minutes"]} minutes; ${todo.length - done} left for the next run.`);
      break;
    }
    try {
      cache[p] = await lookup(p);
      if (cache[p]) found++;
      failedInARow = 0;
    } catch (e) {
      console.warn(`${p}: ${e.message}`);
      if (++failedInARow >= 20) {
        console.warn("20 lookups failed in a row; OneMap may be down. Stopping until the next run.");
        break;
      }
    }
    if (++done % 100 === 0) {
      writeJson(cacheFile, sortKeys(cache), { pretty: false });
      console.log(`  ${done}/${todo.length}`);
    }
    await sleep(PAUSE_MS);
  }
  writeJson(cacheFile, sortKeys(cache), { pretty: false });
  const missing = postals.filter((p) => !cache[p]).length;
  console.log(`Looked up ${done}, found ${found}. Postal codes without coordinates: ${missing}`);
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
