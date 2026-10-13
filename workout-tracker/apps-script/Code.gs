/**
 * Workout tracker backend: a Google Sheet plus this script, deployed as a web app.
 *
 * Tabs (created by Coach → Set up):
 *   Clients    who can log in, one private link (token) each
 *   Exercises  name, YouTube link, muscles, bodyweight?, cues
 *   Program    the plan: one row per exercise per session
 *   Log        every set your clients tick (written by the app)
 *   Sessions   every finished workout (written by the app)
 *   Settings   app_url, notify_email
 *
 * Setup steps are in workout-tracker/README.md. After editing this file, redeploy
 * with Deploy → Manage deployments → Edit → Version: New version, so the URL stays.
 */

var TABS = {
  Clients: ["client_id", "name", "token", "show_rir", "active", "notes"],
  Exercises: ["exercise", "video_url", "primary_muscles", "secondary_muscles", "bodyweight", "cues"],
  Program: ["client_id", "session", "session_name", "order", "exercise", "sets", "reps", "target_kg", "target_rir", "rest_sec", "warmup_sets", "note"],
  Log: ["logged_at", "client_id", "date", "instance_id", "session", "session_name", "exercise", "set_type", "set_no", "kg", "reps", "rir", "entry_id"],
  Sessions: ["instance_id", "client_id", "date", "session", "session_name", "started_at", "finished_at", "duration_min", "sets_done", "note"],
  Settings: ["key", "value"],
};

// Columns kept as plain text so Sheets never turns "8-10" into 10 August.
var TEXT_COLUMNS = {
  Clients: ["client_id", "token"],
  Program: ["client_id", "session_name", "reps", "target_rir", "note"],
  Log: ["logged_at", "client_id", "date", "instance_id", "session_name", "exercise", "set_type", "rir", "entry_id"],
  Sessions: ["instance_id", "client_id", "date", "session_name", "started_at", "finished_at", "note"],
};

var PROGRAM_FIELDS = ["session", "session_name", "order", "exercise", "sets", "reps", "target_kg", "target_rir", "rest_sec", "warmup_sets", "note"];
var EXERCISE_FIELDS = ["exercise", "video_url", "primary_muscles", "secondary_muscles", "bodyweight", "cues"];
var LOG_FIELDS = ["entry_id", "instance_id", "date", "logged_at", "session", "session_name", "exercise", "set_type", "set_no", "kg", "reps", "rir"];
var SESSION_FIELDS = ["instance_id", "session", "session_name", "date", "started_at", "finished_at", "duration_min", "sets_done", "note"];
// If one of these does get mangled into a date, read it back as "M-D".
var RANGE_FIELDS = { reps: true, target_rir: true };

/* ---------- menu ---------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Coach")
    .addItem("Set up / repair tabs", "setup")
    .addItem("Make link for selected client", "makeLink")
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error("This script isn't attached to a Sheet. Open your Google Sheet, go to Extensions → Apps Script, and paste the code there.");
  }
  PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    TABS[name].forEach(function (h) {
      if (headers.indexOf(h) === -1) headers.push(h);
    });
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
    (TEXT_COLUMNS[name] || []).forEach(function (h) {
      sh.getRange(2, headers.indexOf(h) + 1, sh.getMaxRows() - 1, 1).setNumberFormat("@");
    });
  });

  var ex = ss.getSheetByName("Exercises");
  var program = ss.getSheetByName("Program");
  var clients = ss.getSheetByName("Clients");
  var ph = headers_(program);
  var eh = headers_(ex);
  // Exercise names in Program come from a dropdown of the Exercises tab.
  var names = ex.getRange(2, eh.exercise + 1, ex.getMaxRows() - 1, 1);
  program
    .getRange(2, ph.exercise + 1, program.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(names, true).setAllowInvalid(true).build());
  var ch = headers_(clients);
  clients.getRange(2, ch.show_rir + 1, clients.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );
  clients.getRange(2, ch.active + 1, clients.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );
  ex.getRange(2, eh.bodyweight + 1, ex.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );

  seed_(ss);
  var blank = ss.getSheetByName("Sheet1");
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
}

// A test client and a small plan, only when the tabs are empty.
function seed_(ss) {
  var ex = ss.getSheetByName("Exercises");
  if (ex.getLastRow() < 2) {
    appendObjects_(ex, [
      { exercise: "Goblet Squat", primary_muscles: "Quads, Glutes, Adductors", secondary_muscles: "Abs", bodyweight: false, cues: "Elbows inside the knees, chest tall." },
      { exercise: "DB Incline Press (neutral grip)", primary_muscles: "Chest, Front Delts", secondary_muscles: "Triceps", bodyweight: false, cues: "Palms facing each other." },
      { exercise: "Single-Arm DB Row", primary_muscles: "Lats, Upper Back", secondary_muscles: "Biceps", bodyweight: false, cues: "Pull the elbow to your hip." },
      { exercise: "Dead Bug", primary_muscles: "Abs", bodyweight: true, cues: "Lower back flat on the floor." },
    ]);
  }
  var clients = ss.getSheetByName("Clients");
  if (clients.getLastRow() < 2) {
    appendObjects_(clients, [{ client_id: "test", name: "Test", token: newToken_(), show_rir: true, active: true, notes: "Try the app with this one, then add real clients below." }]);
  }
  var program = ss.getSheetByName("Program");
  if (program.getLastRow() < 2) {
    var rows = [];
    [1, 2].forEach(function (n) {
      rows.push(
        { client_id: "test", session: n, session_name: "Week " + n + " · Full body", order: 1, exercise: "Goblet Squat", sets: 3, reps: "10-12", target_kg: 8, target_rir: "2", rest_sec: 90, warmup_sets: 1, note: "Pain-free depth only." },
        { client_id: "test", session: n, session_name: "Week " + n + " · Full body", order: 2, exercise: "DB Incline Press (neutral grip)", sets: 3, reps: "10-12", target_kg: 6, target_rir: "2", rest_sec: 90, warmup_sets: 0, note: "" },
        { client_id: "test", session: n, session_name: "Week " + n + " · Full body", order: 3, exercise: "Single-Arm DB Row", sets: 3, reps: "10-12", target_kg: 8, target_rir: "2", rest_sec: 60, warmup_sets: 0, note: "Each side." },
        { client_id: "test", session: n, session_name: "Week " + n + " · Full body", order: 4, exercise: "Dead Bug", sets: 2, reps: "8", target_kg: "", target_rir: "", rest_sec: 45, warmup_sets: 0, note: "" }
      );
    });
    appendObjects_(program, rows);
  }
  var settings = ss.getSheetByName("Settings");
  if (settings.getLastRow() < 2) {
    appendObjects_(settings, [
      { key: "app_url", value: "" },
      { key: "notify_email", value: "" },
    ]);
  }
}

function makeLink() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== "Clients") return ui.alert("Open the Clients tab and click a client's row first.");
  var row = sh.getActiveRange().getRow();
  if (row < 2) return ui.alert("Click a client's row, not the header.");
  var h = headers_(sh);
  var tokenCell = sh.getRange(row, h.token + 1);
  var token = String(tokenCell.getValue() || "").trim();
  if (!token) {
    token = newToken_();
    tokenCell.setNumberFormat("@").setValue(token);
  }
  var appUrl = String(settings_().app_url || "").trim();
  if (!appUrl) return ui.alert("Put your app's address in Settings → app_url first.");
  var base = /\.html?$/i.test(appUrl) ? appUrl : appUrl.replace(/\/?$/, "/");
  var link = base + "?u=" + encodeURIComponent(token);
  var name = sh.getRange(row, h.name + 1).getValue();
  var html = HtmlService.createHtmlOutput(
    '<p style="font:14px sans-serif">Send this link to <b>' + esc_(name) + "</b>. Anyone with it can see and log their workouts.</p>" +
      '<input style="width:100%;font:14px monospace;padding:8px" readonly value="' + esc_(link) + '" onclick="this.select()">'
  )
    .setWidth(480)
    .setHeight(150);
  ui.showModalDialog(html, "Client link");
}

/* ---------- web app ---------- */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === "ping") return json_({ ok: true });
    var client = findClient_(p.token);
    if (!client) return json_({ ok: false, error: "unknown_link" });
    if (p.action === "bootstrap") return json_(bootstrap_(client));
    return json_({ ok: false, error: "bad_request" });
  } catch (err) {
    return json_({ ok: false, error: "server_error", message: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var client = findClient_(body.token);
    if (!client) return json_({ ok: false, error: "unknown_link" });
    lock.waitLock(20000);
    locked = true;
    var ctx = { log: table_("Log"), sessions: table_("Sessions"), client: client };
    var applied = [];
    var rejected = [];
    (Array.isArray(body.ops) ? body.ops.slice(0, 500) : []).forEach(function (op) {
      var key = op && typeof op.key === "string" ? op.key.slice(0, 120) : "";
      if (!key) return;
      if (applyOp_(ctx, op)) applied.push(key);
      else rejected.push(key);
    });
    return json_({ ok: true, applied: applied, rejected: rejected });
  } catch (err) {
    return json_({ ok: false, error: "server_error", message: String(err && err.message ? err.message : err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function bootstrap_(client) {
  var cid = norm_(client.client_id);
  var program = rows_("Program")
    .filter(function (r) {
      return norm_(r.client_id) === cid && String(r.exercise).trim() !== "" && r.session !== "";
    })
    .map(function (r) {
      return pick_(r, PROGRAM_FIELDS);
    });
  var used = {};
  program.forEach(function (r) {
    used[norm_(r.exercise)] = true;
  });
  var exercises = rows_("Exercises")
    .filter(function (r) {
      return used[norm_(r.exercise)];
    })
    .map(function (r) {
      return pick_(r, EXERCISE_FIELDS);
    });
  var mine = function (r) {
    return norm_(r.client_id) === cid;
  };
  return {
    ok: true,
    client: { id: String(client.client_id), name: String(client.name || ""), show_rir: client.show_rir === "" ? true : truthy_(client.show_rir) },
    program: program,
    exercises: exercises,
    log: rows_("Log").filter(mine).map(function (r) {
      return pick_(r, LOG_FIELDS);
    }),
    sessions: rows_("Sessions").filter(mine).map(function (r) {
      return pick_(r, SESSION_FIELDS);
    }),
    server_time: new Date().toISOString(),
  };
}

function applyOp_(ctx, op) {
  if (!op || typeof op !== "object") return false;
  var cid = ctx.client.client_id;
  if (op.type === "set") {
    if (!validId_(op.entry_id)) return false;
    return !!upsert_(ctx.log, "entry_id", {
      logged_at: str_(op.logged_at), client_id: cid, date: str_(op.date), instance_id: str_(op.instance_id),
      session: num_(op.session), session_name: str_(op.session_name), exercise: str_(op.exercise),
      set_type: op.set_type === "W" ? "W" : "N", set_no: num_(op.set_no), kg: num_(op.kg), reps: num_(op.reps),
      rir: str_(op.rir), entry_id: op.entry_id,
    });
  }
  if (op.type === "delete_set") {
    if (!validId_(op.entry_id)) return false;
    var row = findRow_(ctx.log.sheet, ctx.log.h.entry_id + 1, op.entry_id);
    if (row && norm_(ctx.log.sheet.getRange(row, ctx.log.h.client_id + 1).getValue()) === norm_(cid)) {
      ctx.log.sheet.deleteRow(row);
    }
    return true; // already gone counts as done
  }
  if (op.type === "finish") {
    if (!validId_(op.instance_id)) return false;
    var rec = {
      instance_id: op.instance_id, client_id: cid, date: str_(op.date), session: num_(op.session),
      session_name: str_(op.session_name), started_at: str_(op.started_at), finished_at: str_(op.finished_at),
      duration_min: num_(op.duration_min), sets_done: num_(op.sets_done), note: str_(op.note),
    };
    var result = upsert_(ctx.sessions, "instance_id", rec);
    if (result === "inserted") notify_(ctx, rec);
    return !!result;
  }
  return false;
}

function notify_(ctx, rec) {
  try {
    var to = String(settings_().notify_email || "").trim();
    if (!to) return;
    var lines = rows_("Log")
      .filter(function (r) {
        return r.instance_id === rec.instance_id && r.set_type !== "W";
      })
      .map(function (r) {
        var load = r.kg === "" ? "" : r.kg + " kg × ";
        return r.exercise + " " + r.set_no + ": " + load + r.reps + (r.rir !== "" ? " @" + r.rir : "");
      });
    var who = ctx.client.name || ctx.client.client_id;
    MailApp.sendEmail(
      to,
      who + " finished " + rec.session_name,
      who + " finished " + rec.session_name + " on " + rec.date + " (" + rec.duration_min + " min, " + rec.sets_done + " sets).\n\n" +
        lines.join("\n") + (rec.note ? "\n\nNote:\n" + rec.note : "")
    );
  } catch (err) {
    console.warn("notify failed: " + err);
  }
}

/* ---------- sheet helpers ---------- */

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error("Run Coach → Set up once from the spreadsheet.");
  return ss;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error("Missing tab " + name + ". Run Coach → Set up.");
  return sh;
}

function headers_(sh) {
  var width = Math.max(1, sh.getLastColumn());
  var vals = sh.getRange(1, 1, 1, width).getValues()[0];
  var map = {};
  vals.forEach(function (v, i) {
    var k = String(v).trim();
    if (k && !(k in map)) map[k] = i;
  });
  return map;
}

function rows_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var h = headers_(sh);
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().map(function (r) {
    var o = {};
    Object.keys(h).forEach(function (k) {
      o[k] = r[h[k]];
    });
    return o;
  });
}

function table_(name) {
  var sh = sheet_(name);
  var h = headers_(sh);
  var width = sh.getLastColumn();
  var text = TEXT_COLUMNS[name] || [];
  var formats = [];
  for (var i = 0; i < width; i++) formats.push("General");
  Object.keys(h).forEach(function (k) {
    if (text.indexOf(k) !== -1) formats[h[k]] = "@";
  });
  return { sheet: sh, h: h, width: width, formats: formats };
}

function findRow_(sh, col, value) {
  var last = sh.getLastRow();
  if (last < 2 || !value) return 0;
  var hit = sh.getRange(2, col, last - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

// Insert or update by key. Columns the coach adds to the tab are left alone.
function upsert_(t, keyField, rec) {
  var sh = t.sheet;
  var row = findRow_(sh, t.h[keyField] + 1, rec[keyField]);
  var arr;
  if (row) {
    arr = sh.getRange(row, 1, 1, t.width).getValues()[0];
    if (norm_(arr[t.h.client_id]) !== norm_(rec.client_id)) return null; // someone else's row
  } else {
    arr = [];
    for (var i = 0; i < t.width; i++) arr.push("");
  }
  Object.keys(rec).forEach(function (k) {
    if (k in t.h) arr[t.h[k]] = safe_(rec[k]);
  });
  var target = row || sh.getLastRow() + 1;
  var range = sh.getRange(target, 1, 1, t.width);
  range.setNumberFormats([t.formats]);
  range.setValues([arr]);
  return row ? "updated" : "inserted";
}

function appendObjects_(sh, objs) {
  var h = headers_(sh);
  var width = sh.getLastColumn();
  var rows = objs.map(function (o) {
    var arr = [];
    for (var i = 0; i < width; i++) arr.push("");
    Object.keys(o).forEach(function (k) {
      if (k in h) arr[h[k]] = o[k];
    });
    return arr;
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, width).setValues(rows);
}

function settings_() {
  var out = {};
  rows_("Settings").forEach(function (r) {
    var k = String(r.key || "").trim();
    if (k) out[k] = r.value;
  });
  return out;
}

function findClient_(token) {
  var t = String(token || "").trim();
  if (!/^[\w-]{6,64}$/.test(t)) return null;
  var hits = rows_("Clients").filter(function (r) {
    return String(r.token).trim() === t && r.active !== false && norm_(r.active) !== "false";
  });
  return hits.length ? hits[0] : null;
}

/* ---------- value helpers ---------- */

function pick_(row, fields) {
  var o = {};
  fields.forEach(function (f) {
    o[f] = out_(row[f], f);
  });
  return o;
}

function out_(v, field) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    if (RANGE_FIELDS[field]) return v.getMonth() + 1 + "-" + v.getDate();
    if (field === "date") return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
    return v.toISOString();
  }
  return v;
}

// Text from the app goes in as text, never as a formula.
function safe_(v) {
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function str_(v) {
  return v == null ? "" : String(v).trim().slice(0, 2000);
}

function num_(v) {
  if (v === "" || v == null) return "";
  var n = Number(String(v).replace(",", "."));
  return isFinite(n) ? n : "";
}

function norm_(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

function truthy_(v) {
  if (v === true) return true;
  return ["true", "yes", "y", "1", "x"].indexOf(norm_(v)) !== -1;
}

function validId_(v) {
  return typeof v === "string" && /^[\w.:-]{1,120}$/.test(v);
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, "").slice(0, 12);
}

function esc_(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
