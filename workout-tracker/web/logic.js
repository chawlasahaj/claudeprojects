// Pure helpers shared by the UI and the tests. Nothing in here touches the DOM.

export const DEFAULT_REST_SEC = 90;

export const LOG_FIELDS = [
  "entry_id", "instance_id", "date", "logged_at", "session", "session_name",
  "exercise", "set_type", "set_no", "kg", "reps", "rir",
];
export const SESSION_FIELDS = [
  "instance_id", "session", "session_name", "date", "started_at",
  "finished_at", "duration_min", "sets_done", "note",
];

export const norm = (s) => String(s ?? "").trim().toLowerCase();

export function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function clampInt(v, lo, hi, dflt) {
  const n = numOrNull(v);
  if (n == null) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export function truthy(v) {
  if (typeof v === "boolean") return v;
  return ["true", "yes", "y", "1", "x", "✓"].includes(norm(v));
}

export function newId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}${rand}`;
}

/* ---------- program ---------- */

// "8-10", "8–10", "8 to 10", "12" → {lo, hi}. Anything else ("30s", "AMRAP") keeps its text.
export function parseReps(text) {
  const t = String(text ?? "").trim();
  const m = t.match(/^(\d+)\s*(?:(?:-|–|—|to)\s*(\d+))?\s*$/i);
  if (!m) return { lo: null, hi: null, text: t };
  const lo = Number(m[1]);
  const hi = m[2] ? Number(m[2]) : lo;
  return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), text: t };
}

export function repsLabel(r) {
  if (r.lo == null) return r.text;
  return r.lo === r.hi ? String(r.lo) : `${r.lo}–${r.hi}`;
}

export function toTarget(row) {
  return {
    sets: clampInt(row.sets, 1, 20, 3),
    reps: parseReps(row.reps),
    kg: numOrNull(row.target_kg),
    rir: String(row.target_rir ?? "").trim(),
    rest: clampInt(row.rest_sec, 0, 900, DEFAULT_REST_SEC),
    warmup: clampInt(row.warmup_sets, 0, 5, 0),
    note: String(row.note ?? "").trim(),
  };
}

// Program rows → sessions in order, each with its exercises in order.
export function groupProgram(rows) {
  const by = new Map();
  (rows || []).forEach((r, i) => {
    const n = numOrNull(r.session);
    if (n == null || !String(r.exercise ?? "").trim()) return;
    if (!by.has(n)) by.set(n, { session: n, name: "", items: [] });
    const g = by.get(n);
    if (!g.name && String(r.session_name ?? "").trim()) g.name = String(r.session_name).trim();
    g.items.push({ ...r, exercise: String(r.exercise).trim(), _i: i });
  });
  const out = [...by.values()].sort((a, b) => a.session - b.session);
  for (const g of out) {
    const ord = (x) => numOrNull(x.order) ?? 1000 + x._i;
    g.items.sort((a, b) => ord(a) - ord(b) || a._i - b._i);
    if (!g.name) g.name = `Session ${g.session}`;
  }
  return out;
}

export function finishedNumbers(sessions) {
  const done = new Set();
  for (const s of sessions || []) if (s.finished_at) done.add(Number(s.session));
  return done;
}

// Sessions run in order, not by weekday: a missed day doesn't skip anything.
export function nextSession(groups, sessions) {
  const done = finishedNumbers(sessions);
  return groups.find((g) => !done.has(g.session)) || null;
}

/* ---------- history ---------- */

// Every past performance of one exercise, newest first, warm-ups left out.
export function performances(log, exercise, excludeInstance) {
  const key = norm(exercise);
  const groups = new Map();
  for (const r of log || []) {
    if (norm(r.exercise) !== key || r.set_type === "W") continue;
    if (excludeInstance && r.instance_id === excludeInstance) continue;
    let g = groups.get(r.instance_id);
    if (!g) groups.set(r.instance_id, (g = { instance_id: r.instance_id, date: r.date || "", at: "", sets: [] }));
    g.sets.push(r);
    if (String(r.logged_at || "") > g.at) g.at = String(r.logged_at || "");
  }
  const list = [...groups.values()];
  list.forEach((g) => g.sets.sort((a, b) => Number(a.set_no) - Number(b.set_no)));
  list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.at > a.at ? 1 : b.at < a.at ? -1 : 0));
  return list;
}

export const lastPerformance = (log, exercise, excludeInstance) =>
  performances(log, exercise, excludeInstance)[0] || null;

// What goes in a set's empty boxes: the coach's load when given, else last time's.
export function suggest(target, last, idx, bodyweight) {
  const prev = last && last.sets.length ? last.sets[Math.min(idx, last.sets.length - 1)] : null;
  const prevKg = prev ? numOrNull(prev.kg) : null;
  let kg = null;
  if (!bodyweight) kg = target.kg ?? prevKg;
  let reps = null;
  if (prev && (bodyweight || target.kg == null || target.kg === prevKg)) reps = numOrNull(prev.reps);
  if (reps == null) reps = target.reps.lo;
  return { kg: kg == null ? "" : fmtNum(kg), reps: reps == null ? "" : String(reps) };
}

export function suggestWarmup(working, bodyweight) {
  if (bodyweight) return { kg: "", reps: "5" };
  const kg = numOrNull(working.kg);
  return { kg: kg == null ? "" : fmtNum(Math.round((kg * 0.5) / 2.5) * 2.5), reps: "8" };
}

/* ---------- local data merge ---------- */

const pick = (o, fields) => Object.fromEntries(fields.map((f) => [f, o[f] ?? ""]));

// Applies queued writes to {log, sessions}. Used for the demo store, the offline
// view (server data + what hasn't synced yet) and the cache after a sync.
export function applyOps(db, ops) {
  const log = new Map((db.log || []).map((r) => [r.entry_id, r]));
  const sessions = new Map((db.sessions || []).map((s) => [s.instance_id, s]));
  for (const op of ops || []) {
    if (op.type === "set") log.set(op.entry_id, pick(op, LOG_FIELDS));
    else if (op.type === "delete_set") log.delete(op.entry_id);
    else if (op.type === "finish") {
      sessions.set(op.instance_id, { ...(sessions.get(op.instance_id) || {}), ...pick(op, SESSION_FIELDS) });
    }
  }
  return { log: [...log.values()], sessions: [...sessions.values()] };
}

export function history(db) {
  const byInstance = new Map();
  for (const r of db.log || []) {
    if (!byInstance.has(r.instance_id)) byInstance.set(r.instance_id, []);
    byInstance.get(r.instance_id).push(r);
  }
  return (db.sessions || [])
    .filter((s) => s.finished_at)
    .sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)))
    .map((s) => {
      const exercises = [];
      const idx = new Map();
      for (const r of byInstance.get(s.instance_id) || []) {
        if (!idx.has(r.exercise)) {
          idx.set(r.exercise, exercises.length);
          exercises.push({ name: r.exercise, sets: [] });
        }
        exercises[idx.get(r.exercise)].sets.push(r);
      }
      exercises.forEach((e) =>
        e.sets.sort((a, b) => (a.set_type === b.set_type ? Number(a.set_no) - Number(b.set_no) : a.set_type === "W" ? -1 : 1)),
      );
      return { ...s, exercises };
    });
}

/* ---------- summaries ---------- */

export function estimateMinutes(targets) {
  let sec = 0;
  for (const t of targets) sec += 60 + t.warmup * 60 + t.sets * (45 + t.rest);
  return Math.max(5, Math.round(sec / 60));
}

export function splitList(s) {
  return String(s ?? "").split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
}

export function muscleSummary(items) {
  const by = new Map();
  for (const { lib, target } of items) {
    for (const m of splitList(lib.primary_muscles)) {
      const k = norm(m);
      if (!by.has(k)) by.set(k, { muscle: m, exercises: 0, sets: 0 });
      const e = by.get(k);
      e.exercises += 1;
      e.sets += target.sets;
    }
  }
  return [...by.values()].sort((a, b) => b.sets - a.sets || b.exercises - a.exercises);
}

/* ---------- formatting ---------- */

export function fmtNum(n) {
  const x = numOrNull(n);
  if (x == null) return "";
  return String(Math.round(x * 100) / 100);
}

export function targetText(t, bodyweight) {
  const r = repsLabel(t.reps);
  const numeric = t.reps.lo != null;
  if (bodyweight || t.kg == null) return r ? (numeric ? `${r} reps` : r) : "No target";
  return r ? `${fmtNum(t.kg)} kg × ${r}` : `${fmtNum(t.kg)} kg`;
}

export function planLine(t) {
  const parts = [];
  const r = repsLabel(t.reps);
  parts.push(r ? `${t.sets} × ${r}` : `${t.sets} sets`);
  if (t.kg != null) parts.push(`${fmtNum(t.kg)} kg`);
  if (t.rir) parts.push(`RIR ${t.rir}`);
  return parts.join(" · ");
}

export function setText(s, bodyweight) {
  const kg = numOrNull(s.kg);
  const base = bodyweight || kg == null ? `${s.reps} reps` : `${fmtNum(kg)} kg × ${s.reps}`;
  return s.rir !== "" && s.rir != null ? `${base} @${s.rir}` : base;
}

export function fmtElapsed(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function fmtClock(sec) {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDay(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(ymd || "");
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/* ---------- video ---------- */

export function youtubeId(url) {
  const m = String(url ?? "").match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/,
  );
  return m ? m[1] : null;
}

export function thumbUrl(url) {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

// Only ever hand out http(s) links; with no link, search YouTube for the exercise.
export function videoHref(url, name) {
  const u = String(url ?? "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`;
}

export function initials(name) {
  const words = String(name ?? "").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
}
