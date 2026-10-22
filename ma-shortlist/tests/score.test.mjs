import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, postalDistrict, districtLabel, between } from "../web/lib/geo.js";
import { shortlist, scaleScore, retentionScore, similarSize, WEIGHTS } from "../web/lib/score.js";

test("distance: Raffles Place to Changi Airport is about 17 km", () => {
  const km = distanceKm(1.2840, 103.8510, 1.3644, 103.9915);
  assert.ok(km > 16 && km < 18, km);
  assert.equal(between({ lat: 1, lng: 1 }, { lat: null, lng: 1 }), null);
});

test("postal districts", () => {
  assert.equal(postalDistrict("018989"), 1);
  assert.equal(postalDistrict("259001"), 10);
  assert.equal(postalDistrict("828001"), 19);
  assert.equal(postalDistrict("81234"), 2); // a lost leading zero: 081234 is sector 08, D02
  assert.equal(postalDistrict("999999"), null);
  assert.equal(districtLabel(10), "D10 Bukit Timah, Holland, Tanglin");
});

test("weights add up to 100", () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test("signal helpers", () => {
  assert.ok(similarSize(150, 300) && similarSize(600, 300) && !similarSize(601, 300) && !similarSize(null, 300));
  assert.ok(scaleScore(1) < scaleScore(5) && scaleScore(5) < scaleScore(50));
  assert.ok(scaleScore(20, "smaller") > scaleScore(200, "smaller"));
  assert.ok(scaleScore(200, "larger") > scaleScore(20, "larger"));
  assert.equal(retentionScore({ startCount: 20, lost: 0 }), 1);
  assert.equal(retentionScore({ startCount: 20, lost: 5 }), 0);
  assert.equal(retentionScore({ startCount: 0, lost: 0 }), null);
  assert.equal(retentionScore(null), null);
});

const M = (key, firm, lat, lng, lots, postal = "259001") => ({ key, name: `DEV ${key}`, firm, lat, lng, lots, postal });
const mcsts = [
  M("1", "near", 1.3201, 103.8001, 300),
  M("2", "near", 1.3210, 103.8010, 280),
  M("3", "near", 1.3190, 103.7990, 320),
  M("4", "far", 1.40, 103.90, 300, "545001"),
  M("5", "far", 1.41, 103.91, 310, "545002"),
  M("6", "far", 1.42, 103.92, 290, "545003"),
  M("7", "current", 1.3202, 103.8002, 300),
  M("8", "current", 1.3203, 103.8003, 300),
  M("9", "nocoords", null, null, 300, "259002"),
];
const firms = [
  { id: "near", name: "Near Co", count: 3, history: { startCount: 3, gained: 0, lost: 0 }, accredited: null },
  { id: "far", name: "Far Co", count: 3, history: { startCount: 4, gained: 0, lost: 1 }, accredited: { category: "A" } },
  { id: "current", name: "Current Co", count: 3, history: null, accredited: null },
  { id: "nocoords", name: "No Coords Co", count: 3, history: null, accredited: null },
  { id: "tiny", name: "Tiny Co", count: 2, history: null, accredited: null },
  { id: "empty", name: "Empty Co", count: 0, history: null, accredited: null },
];
const target = { key: "x", lat: 1.32, lng: 103.80, postal: "259010", lots: 300, currentFirm: "current" };

test("shortlist: nearby firm first, current agent and empty firms left out", () => {
  const r = shortlist(target, mcsts, firms, { radiusKm: 3 });
  const ids = r.map((x) => x.firm.id);
  assert.equal(ids[0], "near");
  assert.ok(!ids.includes("current"));
  assert.ok(!ids.includes("empty"));
  assert.equal(r[0].nearby.length, 3);
  assert.ok(r[0].nearby[0].km <= r[0].nearby[1].km);
  assert.match(r[0].reasons[0].text, /Manages 3 developments within 3 km/);
  // The firm without coordinates counts as nearby through the postal district.
  assert.equal(r.find((x) => x.firm.id === "nocoords").nearby.length, 1);
});

test("shortlist: retention and accreditation only count when the data allows", () => {
  const without = shortlist(target, mcsts, firms, {});
  assert.equal(without[0].signals.retention, null);
  assert.equal(without[0].signals.accredited, null);
  const withAll = shortlist(target, mcsts, firms, { history: { since: "2026-01-01", until: "2026-07-01" }, accreditationComplete: true });
  const far = withAll.find((x) => x.firm.id === "far");
  assert.equal(far.signals.accredited, 1);
  assert.equal(far.signals.retention, 0);
  assert.ok(far.reasons.some((x) => x.tone === "warn" && /Lost 1 of 4/.test(x.text)));
  // History shorter than 90 days is ignored.
  const short = shortlist(target, mcsts, firms, { history: { since: "2026-06-01", until: "2026-07-01" } });
  assert.equal(short[0].signals.retention, null);
});

test("shortlist: firms with fewer than 3 developments aren't suggested, unless they're the current agent", () => {
  const withTiny = [...mcsts, M("10", "tiny", 1.3200, 103.8000, 300), M("11", "tiny", 1.3201, 103.8001, 300)];
  assert.ok(!shortlist(target, withTiny, firms, {}).some((x) => x.firm.id === "tiny"));
  assert.ok(shortlist(target, withTiny, firms, { minPortfolio: 1 }).some((x) => x.firm.id === "tiny"));
  const tinyIsCurrent = shortlist({ ...target, currentFirm: "tiny" }, withTiny, firms, { excludeCurrent: false });
  assert.ok(tinyIsCurrent.some((x) => x.firm.id === "tiny"));
});

test("shortlist: can include the current agent, and works without coordinates", () => {
  const r = shortlist(target, mcsts, firms, { excludeCurrent: false });
  assert.ok(r.some((x) => x.firm.id === "current"));
  const noCoords = shortlist({ ...target, lat: null, lng: null }, mcsts, firms, {});
  assert.match(noCoords[0].reasons[0].text, /in your postal district/);
});

test("shortlist: only developments of the chosen type count", () => {
  // "office" runs three offices next door and no homes; "near" runs homes.
  const typed = [
    ...mcsts.map((m) => ({ ...m, use: "home" })),
    { ...M("20", "office", 1.3200, 103.8000, 300), use: "commercial" },
    { ...M("21", "office", 1.3201, 103.8001, 300), use: "commercial" },
    { ...M("22", "office", 1.3202, 103.8002, 300), use: "mixed" },
    { ...M("23", "office", 1.3203, 103.8003, 300), use: null },
  ];
  const withOffice = [...firms, { id: "office", name: "Office Co", count: 4, byUse: { home: 0, mixed: 1, commercial: 2, industrial: 0 }, history: null, accredited: null }];
  const homes = shortlist(target, typed, withOffice, { group: "home" });
  // One mixed-use development isn't enough to be suggested for homes.
  assert.ok(!homes.some((x) => x.firm.id === "office"));
  assert.match(homes[0].reasons[0].text, /Manages 3 residential developments within 3 km/);
  const offices = shortlist(target, typed, withOffice, { group: "commercial" });
  const office = offices.find((x) => x.firm.id === "office");
  assert.equal(office.count, 3);
  assert.equal(office.nearby.length, 3); // commercial and mixed, not the unknown one
  assert.match(office.reasons.at(-1).text, /Manages 3 commercial developments, 4 developments in total/);
  // Firms without type counts (older data) keep their full count.
  assert.ok(offices.some((x) => x.firm.id === "near"));
  const all = shortlist(target, typed, withOffice, { group: "all" });
  assert.equal(all.find((x) => x.firm.id === "office").nearby.length, 4);
});

test("development groups", async () => {
  const { inGroup, groupFor, groupCount } = await import("../web/lib/use.js");
  assert.ok(inGroup("mixed", "home") && inGroup("mixed", "commercial") && !inGroup("mixed", "industrial"));
  assert.ok(!inGroup(null, "home") && inGroup(null, "all") && inGroup("industrial", "unknown-group"));
  assert.equal(groupFor("commercial"), "commercial");
  assert.equal(groupFor("mixed"), "home");
  assert.equal(groupFor(null), "home");
  assert.equal(groupCount({ count: 9, byUse: { home: 4, mixed: 2, commercial: 3, industrial: 0 } }, "home"), 6);
  assert.equal(groupCount({ count: 9 }, "home"), 9);
});
