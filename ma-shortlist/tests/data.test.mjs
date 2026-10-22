import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCsv, csvToObjects } from "../scripts/lib/csv.mjs";
import { mapColumns, normaliseRow, normaliseTable, isActive, isSubMc } from "../scripts/lib/rows.mjs";
import { firmKey, displayName, makeResolver, looksLikeFirm } from "../scripts/lib/firms.mjs";
import { diffHistory } from "../scripts/lib/history.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const FIX = path.join(HERE, "fixtures");

test("CSV: quotes, escaped quotes, newlines in quotes, CRLF and BOM", () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line\nbreak",\r\n\r\n');
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["1", "x, y", 'say "hi"'],
    ["2", "line\nbreak", ""],
  ]);
  assert.deepEqual(csvToObjects("A, B\n1,2\n"), [{ A: "1", B: "2" }]);
});

test("columns are found under CSV, snake_case and older names", () => {
  assert.equal(mapColumns(["MCST No", "Development Name", "Postal Code", "Managing Agent Name"]).ma, "Managing Agent Name");
  const snake = mapColumns(["mcst_no", "development_name", "postal_code", "managing_agent_name", "strata_lots"]);
  assert.equal(snake.lots, "strata_lots");
  const old = mapColumns(["usr_mcno", "mcst_devt_name", "mcst_postalcode", "managing_agent"]);
  assert.equal(old.postal, "mcst_postalcode");
  // The CSV download as of Oct 2026.
  const real = mapColumns("usr_mcno|usr_mctype|sub_mcno|usr_mcstuen|usr_devtname|devt_location|mcst_houseno|mcst_roadname|mcst_unitno|mcst_buildingname|mcst_postalcode|mcst_telno|ust_status|mcst_stratalota|managementname|mc_form_date".split("|"));
  assert.deepEqual(real, {
    mcst: "usr_mcno", sub: "sub_mcno", type: "usr_mctype", uen: "usr_mcstuen", name: "usr_devtname", address: "devt_location",
    postal: "mcst_postalcode", tel: "mcst_telno", status: "ust_status", lots: "mcst_stratalota", ma: "managementname", constituted: "mc_form_date",
    houseNo: "mcst_houseno", road: "mcst_roadname", building: "mcst_buildingname",
  });
  assert.throws(() => mapColumns(["MCST No", "Development Name"]), /Postal|ma/i);
});

test("rows: no-agent values, padded postal codes, lots, sub-MCs and status", () => {
  const map = mapColumns(["MCST No", "Sub MCST No", "MC Type", "Development Name", "Postal Code", "Managing Agent Name", "Strata Lots", "Status"]);
  const row = (o) => normaliseRow({ "MCST No": "123", "Sub MCST No": "", "MC Type": "MC", "Development Name": " THE  PLACE ", "Postal Code": "88123", "Managing Agent Name": "ABC PTE LTD", "Strata Lots": "1,234", Status: "ACTIVE", ...o }, map);
  const r = row({});
  assert.equal(r.name, "THE PLACE");
  assert.equal(r.postal, "088123");
  assert.equal(r.lots, 1234);
  assert.equal(r.key, "123");
  for (const none of ["", "-", "NIL", "N.A.", "Self-managed", "none"]) assert.equal(row({ "Managing Agent Name": none }).ma, "");
  assert.equal(row({ "Sub MCST No": "2" }).key, "123-2");
  assert.ok(isSubMc(row({ "Sub MCST No": "2" })));
  assert.ok(!isSubMc(row({ "Sub MCST No": "0" })));
  assert.ok(!isActive(row({ Status: "TERMINATED" })));
  assert.ok(isActive(row({ Status: "" })));
});

test("firm names: spellings collapse to one key and display nicely", () => {
  const same = ["ABC PROPERTY MGT PTE. LTD.", "ABC Property Management Pte Ltd", "abc property mgmt (s) pte ltd", "THE ABC PROPERTY MANAGEMENT PRIVATE LIMITED"];
  assert.equal(new Set(same.map(firmKey)).size, 1);
  assert.notEqual(firmKey("ABC PROPERTY CONSULTANCY"), firmKey("ABC PROPERTY MANAGEMENT"));
  assert.equal(firmKey("K & L SERVICES"), "K AND L SERVICES");
  assert.equal(displayName("SAVILLS PROPERTY MANAGEMENT PTE LTD"), "Savills Property Management Pte Ltd");
  assert.equal(displayName("CBRE PTE LTD"), "CBRE Pte Ltd");
  assert.equal(displayName("KNIGHT FRANK PROPERTY & FACILITIES MANAGEMENT PTE LTD"), "Knight Frank Property & Facilities Management Pte Ltd");
  assert.equal(displayName("Already Mixed Case Ltd"), "Already Mixed Case Ltd");
  // Names from BCA's real list.
  assert.equal(displayName("SG MANAGING AGENT PTE.LTD."), "SG Managing Agent Pte.Ltd.");
  assert.equal(displayName("THE LOCK MANAGEMENT SERVICES PTE LTD"), "The Lock Management Services Pte Ltd");
  assert.equal(displayName("D'PROMAN & CO. PTE LTD"), "D'Proman & Co. Pte Ltd");
  assert.equal(displayName("HOE-TAN CO (PTE) LTD"), "Hoe-Tan Co (Pte) Ltd");
  assert.equal(displayName("SMART PROPERTY MANAGEMENT (SINGAPORE) PTE LTD"), "Smart Property Management (Singapore) Pte Ltd");
  assert.equal(displayName("360 INTEGRATED FM & SM PTE LTD"), "360 Integrated FM & SM Pte Ltd");
  assert.equal(displayName("CWL FACILITIES MANAGEMENT PTE LTD"), "CWL Facilities Management Pte Ltd");
  assert.equal(firmKey("SMART PROPERTY MANAGEMENT (S) PTE LTD"), firmKey("Smart Property Management (Singapore) Pte Ltd"));
});

test("people's names, MCST and placeholders aren't managing agents", () => {
  const resolve = makeResolver({});
  for (const n of ["MCST", "N", "n", "GAN BOON SIONG", "MS CATHERINE", "MDM MOH TAI HO"]) {
    assert.equal(looksLikeFirm(n), false, n);
    assert.equal(resolve(n), null, n);
  }
  for (const n of ["CBRE PTE LTD", "A & L PROPERTY SERVICES", "DZ INNOVATIONS", "BK TAN CONSULTANTS", "IMANAGE MCST SERVICES PTE LTD"]) {
    assert.ok(looksLikeFirm(n), n);
  }
});

test("display name: BCA's mixed-case spelling of the same name beats our casing", async () => {
  const { nameFor } = await import("../scripts/build-data.mjs");
  assert.equal(nameFor(["JONES LANG LASALLE PTE LTD", "Jones Lang LaSalle Pte Ltd"]), "Jones Lang LaSalle Pte Ltd");
  // A mixed-case typo isn't preferred over the common spelling.
  assert.equal(nameFor(["PROPERTY FACILITY SERVICES PTE LTD", "Property Facility Serivces Pte Ltd"]), "Property Facility Services Pte Ltd");
  assert.equal(nameFor(["Ocean IFM Pte. Ltd.", "OCEAN IFM PTE LTD"]), "Ocean IFM Pte. Ltd.");
});

test("aliases: merges follow chains, notFirm values resolve to nothing", () => {
  const resolve = makeResolver({ merge: { "OLD NAME PTE LTD": "MIDDLE NAME", "MIDDLE NAME": "NEW NAME PTE LTD" }, notFirm: ["Developer"] });
  assert.equal(resolve("Old Name Pte. Ltd.").id, "new-name");
  assert.equal(resolve("DEVELOPER"), null);
  const loop = makeResolver({ merge: { "A PTE LTD": "B PTE LTD", "B PTE LTD": "A PTE LTD" } });
  assert.ok(loop("A PTE LTD").id);
});

test("history: switches count, renames and new or terminated developments don't", () => {
  const resolve = makeResolver({});
  const d = diffHistory(
    { date: "2026-01-01", agents: { 1: "ALPHA PTE LTD", 2: "ALPHA MGT PTE LTD", 3: "BETA PTE LTD", 4: "BETA PTE LTD", 9: "ALPHA PTE LTD" } },
    { date: "2026-07-01", agents: { 1: "BETA PTE LTD", 2: "Alpha Management Pte Ltd", 3: "BETA PTE LTD", 4: "", 5: "ALPHA PTE LTD" } },
    resolve,
  );
  assert.equal(d.switches, 2);
  assert.deepEqual(d.perFirm.alpha, { startCount: 2, gained: 0, lost: 1, newDevelopments: 1, in: [], out: [{ key: "1", to: "beta" }] });
  assert.equal(d.perFirm.beta.gained, 1);
  assert.equal(d.perFirm.beta.lost, 1);
  // Same firm, new spelling of the same key: not a switch.
  assert.equal(d.perFirm["alpha-management"].lost, 0);
  assert.equal(d.perFirm["alpha-management"].gained, 0);
});

test("pipeline on the fixtures: fetch twice, build, check the output", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mas-"));
  for (const f of ["geocode-cache.json", "accreditation.json"]) fs.copyFileSync(path.join(FIX, f), path.join(tmp, f));
  const run = (...a) => execFileSync(process.execPath, a, { cwd: ROOT, encoding: "utf8" });
  run("scripts/fetch-mcst.mjs", "--csv", path.join(FIX, "mcst-sample-earlier.csv"), "--data", tmp, "--date", "2026-03-01");
  run("scripts/fetch-mcst.mjs", "--csv", path.join(FIX, "mcst-sample.csv"), "--data", tmp, "--date", "2026-10-01");
  // Running again with the same data writes no new history.
  const again = run("scripts/fetch-mcst.mjs", "--csv", path.join(FIX, "mcst-sample.csv"), "--data", tmp, "--date", "2026-10-15");
  assert.match(again, /unchanged/);
  run("scripts/build-data.mjs", "--data", tmp, "--out", path.join(tmp, "out"));

  const meta = JSON.parse(fs.readFileSync(path.join(tmp, "out", "meta.json"), "utf8"));
  const agents = JSON.parse(fs.readFileSync(path.join(tmp, "out", "agents.json"), "utf8"));
  const mcst = JSON.parse(fs.readFileSync(path.join(tmp, "out", "mcst.json"), "utf8"));

  assert.equal(meta.counts.mcsts, 24); // terminated and sub-MC rows dropped
  assert.equal(meta.counts.noAgent, 2);
  assert.equal(meta.counts.located, 23);
  assert.deepEqual(meta.history, { since: "2026-03-01", until: "2026-10-01", switches: 3, snapshots: 2 });
  assert.equal(meta.accreditation.matched, 2);

  const alpha = agents.find((a) => a.id === "alpha-estate-management");
  assert.equal(alpha.count, 7);
  assert.equal(alpha.spellings.length, 2);
  assert.deepEqual(alpha.accredited, { category: "A" });
  assert.deepEqual(alpha.history, { startCount: 6, gained: 2, lost: 0, newDevelopments: 0 });
  const bright = agents.find((a) => a.id === "brightway-property-services");
  assert.deepEqual([bright.history.gained, bright.history.lost], [1, 2]);
  assert.equal(agents[0].id, "alpha-estate-management");

  assert.equal(mcst.cols.length, mcst.rows[0].length);
  assert.ok(mcst.rows.every((r) => !String(r[mcst.cols.indexOf("name")]).includes("SUB MC")));
});

test("build-data with no fetched data exits quietly", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mas-empty-"));
  const out = execFileSync(process.execPath, ["scripts/build-data.mjs", "--data", tmp, "--out", path.join(tmp, "out")], { cwd: ROOT, encoding: "utf8" });
  assert.match(out, /Nothing built/);
});

test("normaliseTable on an empty table", () => {
  assert.deepEqual(normaliseTable([]), { rows: [], map: {} });
});

test("history ignores a snapshot keyed differently from today's", async () => {
  const { build } = await import("../scripts/build-data.mjs");
  const current = { rows: [{ key: "1", mcst: "1", sub: "", type: "MC", name: "A", address: "", postal: "259001", tel: "", status: "ACTIVE", lots: 10, ma: "X PTE LTD" }], fetchedAt: "2026-10-01", source: {} };
  const history = [
    { date: "2024-08-31", agents: { "MCST 1": "Y PTE LTD" } },
    { date: "2026-10-01", agents: { 1: "X PTE LTD" } },
  ];
  const r = build({ current, history, geocodes: {}, aliases: {}, accreditation: {} });
  assert.equal(r.meta.history, null);
  assert.deepEqual(r.report.skippedSnapshots, ["2024-08-31"]);
});
