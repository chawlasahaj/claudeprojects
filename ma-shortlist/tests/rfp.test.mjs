import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, addMonths, parseDate, iso, emailText, SCOPE_ITEMS } from "../web/lib/rfp.js";
import { normaliseQuote, scoreQuotes, QUOTE_FIELDS, DEFAULT_WEIGHTS } from "../web/lib/compare.js";

test("addMonths clamps to the end of shorter months", () => {
  assert.equal(iso(addMonths(parseDate("2026-05-31"), -3)), "2026-02-28");
  assert.equal(iso(addMonths(parseDate("2028-05-31"), -3)), "2028-02-29");
  assert.equal(iso(addMonths(parseDate("2026-01-15"), -2)), "2025-11-15");
});

test("timeline works back from the start date in order", () => {
  const t = buildTimeline("2027-07-01", { noticeMonths: 3, today: "2026-10-22" });
  const at = Object.fromEntries(t.steps.map((s) => [s.id, s.date]));
  assert.equal(at.start, "2027-07-01");
  assert.equal(at.notice, "2027-04-01");
  assert.equal(at.meeting, "2027-03-25");
  assert.equal(at.meetingNotice, "2027-03-11");
  assert.ok(at.issue < at.close && at.close < at.interviews && at.interviews < at.decide && at.decide < at.meetingNotice);
  const dates = t.steps.map((s) => s.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(t.startsInPast, false);
});

test("timeline without a general meeting, and one that's too tight", () => {
  const t = buildTimeline("2027-07-01", { needsGeneralMeeting: false, today: "2026-10-22" });
  assert.ok(!t.steps.some((s) => s.id === "meeting"));
  const tight = buildTimeline("2026-12-01", { today: "2026-10-22" });
  assert.equal(tight.startsInPast, true);
  assert.equal(buildTimeline("not a date"), null);
});

test("email text fills in what it has and marks the gaps", () => {
  const e = emailText({ development: "THE PLACE", mcstNo: "1234", closeDate: "2027-01-15" });
  assert.match(e, /THE PLACE \(MCST 1234\)/);
  assert.match(e, /by 2027-01-15/);
  assert.match(e, /\[name\]/);
  assert.ok(SCOPE_ITEMS.length >= 8);
});

test("a quote normalises to yearly cost, per unit and per manager hour", () => {
  const n = normaliseQuote(
    { managementFee: "5,000", staffCost: 1000, otherMonthly: 0, meetingCost: 1500, otherAnnual: 500, disbursements: 1000, managerHours: 40, termMonths: 24, escalation: 3, gst: true },
    { units: 200 },
  );
  const annual = (6000 * 12 + 1500 + 500 + 1000) * 1.09;
  assert.ok(Math.abs(n.annual - annual) < 0.01);
  assert.ok(Math.abs(n.perUnitMonth - annual / 12 / 200) < 0.01);
  assert.ok(Math.abs(n.perManagerHour - (72000 * 1.09) / (40 * 52)) < 0.01);
  assert.ok(Math.abs(n.termTotal - (annual + annual * 1.03)) < 0.01);
  assert.deepEqual(n.missing, []);
  assert.deepEqual(normaliseQuote({}, {}).missing, QUOTE_FIELDS.filter((f) => f.required).map((f) => f.label));
});

test("scores: cheapest gets full price marks; ratings fill in the rest", () => {
  const rows = scoreQuotes(
    [
      { name: "Cheap", values: { managementFee: 4000 }, ratings: { manpower: 2, references: 2, proposal: 2 } },
      { name: "Good", values: { managementFee: 5000 }, ratings: { manpower: 5, references: 5, proposal: 5 } },
      { name: "Blank", values: {}, ratings: {} },
    ],
    DEFAULT_WEIGHTS,
    { units: 100 },
  );
  const [cheap, good, blank] = rows;
  assert.equal(cheap.parts.price, 100);
  assert.equal(good.parts.price, 80);
  assert.equal(cheap.total, Math.round(0.4 * 100 + 0.6 * 25));
  assert.equal(good.total, Math.round(0.4 * 80 + 0.6 * 100));
  assert.equal(good.rank, 1);
  assert.equal(blank.total, null);
  assert.equal(blank.rank, undefined);
});
