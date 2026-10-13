// Runs Code.gs against the in-memory Sheets fake in fake-sheets.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, rowsOf } from "./fake-sheets.mjs";

const parse = (out) => JSON.parse(out.body);
const get = (ctx, parameter) => parse(ctx.doGet({ parameter }));
const post = (ctx, body) => parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }));

function setUp() {
  const env = makeEnv();
  env.ctx.setup();
  env.token = rowsOf(env.sheets.get("Clients"))[0].token;
  return env;
}

const setOp = (over = {}) => ({
  type: "set", key: `s:${over.entry_id || "i1.0.1"}`, entry_id: "i1.0.1", instance_id: "i1", date: "2026-10-13",
  logged_at: "2026-10-13T01:00:00.000Z", session: 1, session_name: "Week 1 · Full body", exercise: "Goblet Squat",
  set_type: "N", set_no: 1, kg: "10", reps: "12", rir: "2", ...over,
});

test("setup builds every tab and a working test client", () => {
  const { ctx, sheets, token } = setUp();
  for (const t of ["Clients", "Exercises", "Program", "Log", "Sessions", "Settings"]) assert.ok(sheets.get(t), t);
  assert.equal(sheets.has("Sheet1"), false);
  assert.match(token, /^[0-9a-f]{12}$/);
  const res = get(ctx, { action: "bootstrap", token });
  assert.equal(res.ok, true);
  assert.equal(res.client.name, "Test");
  assert.equal(res.client.show_rir, true);
  assert.equal(res.program.length, 8);
  assert.equal(res.program[0].reps, "10-12");
  assert.equal(res.exercises.length, 4);
  assert.deepEqual(res.log, []);
});

test("setup can be re-run without duplicating anything", () => {
  const { ctx, sheets } = setUp();
  ctx.setup();
  assert.equal(rowsOf(sheets.get("Clients")).length, 1);
  assert.equal(rowsOf(sheets.get("Program")).length, 8);
  assert.equal(sheets.get("Log").getLastColumn(), 13);
});

test("bad and inactive links are refused", () => {
  const { ctx, sheets, token } = setUp();
  assert.equal(get(ctx, { action: "bootstrap", token: "nope-nope" }).error, "unknown_link");
  assert.equal(get(ctx, { action: "bootstrap" }).error, "unknown_link");
  assert.equal(post(ctx, { token: "nope-nope", ops: [setOp()] }).error, "unknown_link");
  const clients = sheets.get("Clients");
  clients.getRange(2, 5).setValue(false); // active
  assert.equal(get(ctx, { action: "bootstrap", token }).error, "unknown_link");
});

test("sets are upserted by entry_id, deleted, and sessions finished once", () => {
  const { ctx, sheets, token } = setUp();
  let res = post(ctx, { token, ops: [setOp(), setOp({ entry_id: "i1.0.2", key: "s:i1.0.2", set_no: 2, reps: "11" })] });
  assert.deepEqual(res.applied, ["s:i1.0.1", "s:i1.0.2"]);
  // Retrying the same write (as the offline queue does) updates, never duplicates.
  res = post(ctx, { token, ops: [setOp({ kg: "12.5" })] });
  assert.equal(res.ok, true);
  let log = rowsOf(sheets.get("Log"));
  assert.equal(log.length, 2);
  assert.equal(log[0].kg, 12.5);
  assert.equal(log[0].client_id, "test");
  assert.equal(log[0].date, "2026-10-13");

  post(ctx, { token, ops: [{ type: "delete_set", key: "s:i1.0.2", entry_id: "i1.0.2" }] });
  log = rowsOf(sheets.get("Log"));
  assert.equal(log.length, 1);

  const finish = { type: "finish", key: "f:i1", instance_id: "i1", session: 1, session_name: "Week 1 · Full body", date: "2026-10-13", started_at: "a", finished_at: "b", duration_min: 40, sets_done: 1, note: "Good" };
  post(ctx, { token, ops: [finish] });
  post(ctx, { token, ops: [finish] });
  assert.equal(rowsOf(sheets.get("Sessions")).length, 1);

  const boot = get(ctx, { action: "bootstrap", token });
  assert.equal(boot.log.length, 1);
  assert.equal(boot.log[0].rir, "2");
  assert.equal(boot.sessions[0].finished_at, "b");
});

test("finishing emails the coach once, when notify_email is set", () => {
  const { ctx, sheets, mail, token } = setUp();
  const settings = sheets.get("Settings");
  settings.getRange(3, 2).setValue("coach@example.com");
  post(ctx, { token, ops: [setOp()] });
  const finish = { type: "finish", key: "f:i1", instance_id: "i1", session: 1, session_name: "Week 1", date: "2026-10-13", duration_min: 30, sets_done: 1 };
  post(ctx, { token, ops: [finish] });
  post(ctx, { token, ops: [finish] });
  assert.equal(mail.length, 1);
  assert.equal(mail[0][0], "coach@example.com");
  assert.match(mail[0][2], /Goblet Squat 1: 10 kg × 12 @2/);
});

test("a range typed into an unformatted cell still comes back as text", () => {
  const { ctx, sheets, token } = setUp();
  const program = sheets.get("Program");
  program.fmt.delete("2:7"); // the coach pasted over the text format
  program.getRange(2, 7).setValue("8-10");
  assert.ok(program.get(2, 7) instanceof Date);
  assert.equal(get(ctx, { action: "bootstrap", token }).program[0].reps, "8-10");
});

test("text from the app never lands as a formula", () => {
  const { ctx, sheets, token } = setUp();
  const finish = { type: "finish", key: "f:i9", instance_id: "i9", session: 1, note: "=IMPORTXML(\"http://x\",\"//a\")", session_name: "+1" };
  const res = post(ctx, { token, ops: [finish, setOp({ exercise: "=1+1" })] });
  assert.equal(res.ok, true);
  assert.equal(rowsOf(sheets.get("Sessions"))[0].note, "=IMPORTXML(\"http://x\",\"//a\")");
  assert.equal(rowsOf(sheets.get("Log"))[0].exercise, "=1+1");
});

test("one client can't overwrite another's sets, and junk is rejected", () => {
  const { ctx, sheets, token } = setUp();
  const clients = sheets.get("Clients");
  clients.getRange(3, 1, 1, 5).setValues([["mum", "Mum", "'mumtoken99", true, true]]);
  post(ctx, { token, ops: [setOp()] });
  const res = post(ctx, { token: "mumtoken99", ops: [setOp({ kg: "99" }), { type: "set", key: "s:bad id", entry_id: "bad id" }, { type: "nope", key: "x" }] });
  assert.deepEqual(res.applied, []);
  assert.deepEqual(res.rejected, ["s:i1.0.1", "s:bad id", "x"]);
  assert.equal(rowsOf(sheets.get("Log"))[0].kg, 10);
  // Each client only ever sees their own plan and log.
  assert.equal(get(ctx, { action: "bootstrap", token: "mumtoken99" }).log.length, 0);
});

test("checkbox columns (which read FALSE on empty rows) don't push data to the bottom", () => {
  const { ctx, sheets, token } = setUp();
  const clients = sheets.get("Clients");
  assert.equal(clients.get(2, 1), "test"); // seeded at the top, not at row 1001
  assert.equal(clients.get(5, 4), false); // the empty rows below really do read FALSE
  // The coach adds a "reviewed" checkbox column to Log.
  const log = sheets.get("Log");
  log.getRange(1, 14).setValue("reviewed");
  log.getRange(2, 14, 999, 1).setDataValidation({ checkbox: true });
  post(ctx, { token, ops: [setOp()] });
  assert.equal(log.get(2, 13), "i1.0.1");
  assert.equal(log.get(2, 14), false); // their column is left as it was
  // A second client typed in by hand under the test client is found.
  clients.getRange(3, 1, 1, 5).setValues([["mum", "Mum", "'mumtoken99", true, true]]);
  assert.equal(get(ctx, { action: "bootstrap", token: "mumtoken99" }).client.name, "Mum");
});
