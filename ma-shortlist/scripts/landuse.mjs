// Finds URA's Master Plan land-use zone at each MCST's postal code and caches it in
// data/landuse-cache.json. The layer is a large download, so it's only fetched when there are
// postal codes on the map that haven't been looked up yet.
//
//   node scripts/landuse.mjs [--data <dir>] [--geojson file] [--dataset <id>] [--refresh]
//
// --geojson uses a local file instead of downloading; --refresh looks up every postal code again.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ROOT, parseArgs, readJson, writeJson, fetchRetry, today } from "./lib/io.mjs";
import { downloadUrl, metadata } from "./lib/datagov.mjs";
import { isActive, isSubMc } from "./lib/rows.mjs";
import { luDesc, zoneUse, eachFeature, inGeometry, bbox, pointGrid, samplePoints, zoneFromSamples } from "./lib/landuse.mjs";

// Master Plan 2025, then Master Plan 2019 if that can't be downloaded.
export const DATASETS = ["d_a8c3546b26712e35021f3a681d0353ae", "d_90d86daa5bfaa371668b84fa5f01424f"];

async function download(id) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "landuse-")), `${id}.geojson`);
  const res = await fetchRetry(await downloadUrl(id, { polls: 40 }));
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
  return file;
}

async function getLayer(args) {
  if (args.geojson) return { file: args.geojson, dataset: args.dataset ?? "local", title: path.basename(args.geojson) };
  for (const id of args.dataset ? [args.dataset] : DATASETS) {
    try {
      const file = await download(id);
      const { title } = await metadata(id);
      return { file, dataset: id, title };
    } catch (e) {
      console.warn(`Couldn't download ${id}: ${e.message}`);
    }
  }
  throw new Error("No land-use layer could be downloaded");
}

// Returns { [postal]: [{ ring, lu }] } for every sample point that falls in a zone.
export async function lookUp(file, coords) {
  const points = [];
  for (const [postal, [lat, lng]] of Object.entries(coords)) {
    for (const s of samplePoints(lat, lng)) points.push({ ...s, postal, lu: null });
  }
  const grid = pointGrid(points);
  const vocabulary = {};
  let features = 0;
  await eachFeature(file, (f) => {
    if (f?.type !== "Feature" || !f.geometry) return;
    features++;
    const lu = luDesc(f.properties);
    vocabulary[lu ?? "(none)"] = (vocabulary[lu ?? "(none)"] ?? 0) + 1;
    for (const i of grid.within(bbox(f.geometry))) {
      const p = points[i];
      if (p.lu == null && inGeometry(p.lng, p.lat, f.geometry)) p.lu = lu;
    }
  });
  const byPostal = {};
  for (const p of points) (byPostal[p.postal] ??= []).push(p);
  return { byPostal, features, vocabulary };
}

const tally = (values) => Object.entries(values.reduce((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

async function main() {
  const args = parseArgs();
  const dir = path.resolve(args.data ?? path.join(ROOT, "data"));
  const cacheFile = path.join(dir, "landuse-cache.json");
  const cache = readJson(cacheFile, { zones: {} });
  const geocodes = readJson(path.join(dir, "geocode-cache.json"), {});
  const { rows } = readJson(path.join(dir, "current.json"));

  const postals = [...new Set(rows.filter((r) => isActive(r) && !isSubMc(r)).map((r) => r.postal))].filter((p) => geocodes[p]);
  const todo = postals.filter((p) => args.refresh || !(p in cache.zones));
  console.log(`${postals.length} postal codes on the map, ${todo.length} without a land-use zone yet`);
  if (!todo.length) return;

  const layer = await getLayer(args);
  console.log(`Layer: ${layer.title ?? layer.dataset} (${layer.dataset}), ${(fs.statSync(layer.file).size / 1e6).toFixed(0)} MB`);
  // Every postal code is looked up again whenever the layer is downloaded, so the cache always
  // comes from one version of the Master Plan.
  const coords = Object.fromEntries(postals.map((p) => [p, geocodes[p]]));
  const { byPostal, features, vocabulary } = await lookUp(layer.file, coords);
  console.log(`${features} zones read`);
  console.log("Zone types in the layer:", Object.entries(vocabulary).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join("; "));
  if (!args.geojson) fs.rmSync(path.dirname(layer.file), { recursive: true, force: true });

  const zones = {};
  for (const p of postals) zones[p] = zoneFromSamples(byPostal[p] ?? []);
  writeJson(cacheFile, { dataset: layer.dataset, title: layer.title, checked: today(), zones }, { pretty: false });

  const list = Object.values(zones);
  console.log("Zone at each postal code:", tally(list.map((z) => z.lu ?? "(outside every zone)")).map(([k, n]) => `${k} ${n}`).join("; "));
  console.log(`Used the zone next door for ${list.filter((z) => z.near).length}; no building zone found for ${list.filter((z) => !zoneUse(z.lu) && !z.near).length}`);
  console.log("Unmapped zone types at postal codes:", tally(list.filter((z) => z.lu && !zoneUse(z.lu)).map((z) => z.lu)).map(([k, n]) => `${k} ${n}`).join("; ") || "none");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
