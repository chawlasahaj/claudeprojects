import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../web/logic.js";

test("parseReps reads ranges and keeps odd text", () => {
  assert.deepEqual(L.parseReps("8-10"), { lo: 8, hi: 10, text: "8-10" });
  assert.deepEqual(L.parseReps("8–10"), { lo: 8, hi: 10, text: "8–10" });
  assert.deepEqual(L.parseReps("8 to 10"), { lo: 8, hi: 10, text: "8 to 10" });
  assert.deepEqual(L.parseReps(12), { lo: 12, hi: 12, text: "12" });
  assert.equal(L.parseReps("30s").lo, null);
  assert.equal(L.parseReps("").lo, null);
});

test("youtubeId handles the usual link shapes", () => {
  assert.equal(L.youtubeId("https://www.youtube.com/watch?v=fURsHPHgssI"), "fURsHPHgssI");
  assert.equal(L.youtubeId("https://youtu.be/fURsHPHgssI?t=30"), "fURsHPHgssI");
  assert.equal(L.youtubeId("https://www.youtube.com/watch?feature=share&v=fURsHPHgssI"), "fURsHPHgssI");
  assert.equal(L.youtubeId("https://youtube.com/shorts/fURsHPHgssI"), "fURsHPHgssI");
  assert.equal(L.youtubeId("not a link"), null);
});

test("videoHref never passes through non-http links", () => {
  assert.equal(L.videoHref("javascript:alert(1)", "Squat").startsWith("https://www.youtube.com/results?"), true);
  assert.equal(L.videoHref("https://youtu.be/abc", "Squat"), "https://youtu.be/abc");
  assert.match(L.videoHref("", "Goblet Squat"), /search_query=Goblet%20Squat/);
});

const rows = [
  { session: 2, session_name: "Day B", order: 2, exercise: "Row" },
  { session: 1, session_name: "Day A", order: 2, exercise: "Press" },
  { session: 1, session_name: "", order: 1, exercise: "Squat" },
  { session: 2, order: 1, exercise: "Hinge" },
  { session: "", exercise: "Orphan" },
  { session: 3, exercise: "  " },
];

test("groupProgram orders sessions and exercises, skips blanks", () => {
  const g = L.groupProgram(rows);
  assert.deepEqual(g.map((x) => x.session), [1, 2]);
  assert.deepEqual(g[0].items.map((x) => x.exercise), ["Squat", "Press"]);
  assert.equal(g[0].name, "Day A");
  assert.deepEqual(g[1].items.map((x) => x.exercise), ["Hinge", "Row"]);
});

test("nextSession is the first one not finished, in order", () => {
  const g = L.groupProgram(rows);
  assert.equal(L.nextSession(g, []).session, 1);
  assert.equal(L.nextSession(g, [{ session: 1, finished_at: "x" }]).session, 2);
  assert.equal(L.nextSession(g, [{ session: 1, finished_at: "" }]).session, 1);
  assert.equal(L.nextSession(g, [{ session: 1, finished_at: "x" }, { session: "2", finished_at: "y" }]), null);
});

const log = [
  { instance_id: "a", date: "2026-10-01", logged_at: "2026-10-01T07:00:00Z", exercise: "Squat", set_type: "W", set_no: 1, kg: 4, reps: 8, rir: "" },
  { instance_id: "a", date: "2026-10-01", logged_at: "2026-10-01T07:01:00Z", exercise: "Squat", set_type: "N", set_no: 2, kg: 10, reps: 10, rir: "2" },
  { instance_id: "a", date: "2026-10-01", logged_at: "2026-10-01T07:00:30Z", exercise: "squat ", set_type: "N", set_no: 1, kg: 10, reps: 12, rir: "3" },
  { instance_id: "b", date: "2026-10-05", logged_at: "2026-10-05T07:00:00Z", exercise: "Squat", set_type: "N", set_no: 1, kg: 12, reps: 9, rir: "2" },
  { instance_id: "c", date: "2026-10-08", logged_at: "2026-10-08T07:00:00Z", exercise: "Squat", set_type: "N", set_no: 1, kg: 14, reps: 8, rir: "1" },
];

test("lastPerformance takes the newest session, skips warm-ups and the current one", () => {
  const last = L.lastPerformance(log, "Squat", "c");
  assert.equal(last.instance_id, "b");
  const older = L.performances(log, "SQUAT", "c")[1];
  assert.deepEqual(older.sets.map((s) => s.set_no), [1, 2]);
  assert.equal(L.lastPerformance(log, "Bench", null), null);
});

test("suggest prefers the coach's load, then last time, then the bottom of the range", () => {
  const t = L.toTarget({ sets: 3, reps: "8-10", target_kg: "" });
  const last = L.lastPerformance(log, "Squat", "c");
  assert.deepEqual(L.suggest(t, null, 0, false), { kg: "", reps: "8" });
  assert.deepEqual(L.suggest(t, last, 0, false), { kg: "12", reps: "9" });
  assert.deepEqual(L.suggest(t, last, 2, false), { kg: "12", reps: "9" }); // fewer sets last time
  const heavier = L.toTarget({ sets: 3, reps: "8-10", target_kg: 14 });
  assert.deepEqual(L.suggest(heavier, last, 0, false), { kg: "14", reps: "8" });
  const same = L.toTarget({ sets: 3, reps: "8-10", target_kg: 12 });
  assert.deepEqual(L.suggest(same, last, 0, false), { kg: "12", reps: "9" });
  assert.deepEqual(L.suggest(t, last, 0, true), { kg: "", reps: "9" });
});

test("warm-up suggestion is half the working load, rounded to 2.5", () => {
  assert.deepEqual(L.suggestWarmup({ kg: "50" }, false), { kg: "25", reps: "8" });
  assert.deepEqual(L.suggestWarmup({ kg: "12" }, false), { kg: "5", reps: "8" });
  assert.deepEqual(L.suggestWarmup({ kg: "" }, false), { kg: "", reps: "8" });
});

test("applyOps upserts sets, deletes them, and records finished sessions", () => {
  let db = { log: [], sessions: [] };
  db = L.applyOps(db, [
    { type: "set", entry_id: "x.1", instance_id: "x", exercise: "Squat", kg: "10", reps: "8" },
    { type: "set", entry_id: "x.2", instance_id: "x", exercise: "Squat", kg: "10", reps: "8" },
  ]);
  db = L.applyOps(db, [
    { type: "set", entry_id: "x.1", instance_id: "x", exercise: "Squat", kg: "12", reps: "8" },
    { type: "delete_set", entry_id: "x.2" },
    { type: "finish", instance_id: "x", session: 1, finished_at: "t" },
  ]);
  assert.equal(db.log.length, 1);
  assert.equal(db.log[0].kg, "12");
  assert.equal(db.sessions[0].finished_at, "t");
  const h = L.history(db);
  assert.equal(h.length, 1);
  assert.equal(h[0].exercises[0].sets.length, 1);
});

test("text helpers", () => {
  const t = L.toTarget({ sets: 3, reps: "8-10", target_kg: 47.5, target_rir: "2" });
  assert.equal(L.targetText(t, false), "47.5 kg × 8–10");
  assert.equal(L.targetText(t, true), "8–10 reps");
  assert.equal(L.targetText(L.toTarget({}), false), "No target");
  assert.equal(L.planLine(t), "3 × 8–10 · 47.5 kg · RIR 2");
  assert.equal(L.setText({ kg: 50, reps: 8, rir: "2" }, false), "50 kg × 8 @2");
  assert.equal(L.setText({ kg: "", reps: 15, rir: "" }, false), "15 reps");
  assert.equal(L.fmtElapsed(28_000), "0:00:28");
  assert.equal(L.fmtElapsed(3_725_000), "1:02:05");
  assert.equal(L.fmtClock(180), "3:00");
  assert.equal(L.fmtClock(0.2), "0:01");
  assert.equal(L.fmtDay("2026-10-13"), "Tue 13 Oct");
  assert.equal(L.initials("DB Incline Press"), "DI");
});

test("muscleSummary counts primary muscles by sets", () => {
  const items = [
    { lib: { primary_muscles: "Chest, Front Delts" }, target: { sets: 3 } },
    { lib: { primary_muscles: "chest" }, target: { sets: 2 } },
    { lib: {}, target: { sets: 3 } },
  ];
  assert.deepEqual(L.muscleSummary(items).map((m) => [m.muscle, m.exercises, m.sets]), [
    ["Chest", 2, 5],
    ["Front Delts", 1, 3],
  ]);
});

test("estimateMinutes is sensible", () => {
  const t = L.toTarget({ sets: 3, rest_sec: 90 });
  // Per exercise: 1 min setup + 3 sets × (45 s work + 90 s rest) = 465 s.
  assert.equal(L.estimateMinutes([t, t, t, t]), 31);
});
