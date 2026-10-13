// Talks to the Google Sheet (via the Apps Script web app) and keeps an offline
// queue, so every set is saved on the phone first and sent when there's signal.

import { API_URL } from "./config.js";
import { applyOps, norm, truthy } from "./logic.js";
import { DEMO } from "./demo-data.js";

export const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
};

export class ApiError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
}

const isDemo = (token) => token === "demo";
const bootKey = (t) => `wt.boot.${t}`;
const queueKey = (t) => `wt.queue.${t}`;
const DEMO_DB = "wt.demo.db";

async function fetchJson(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) throw new ApiError("http_" + res.status);
    try {
      return await res.json();
    } catch {
      throw new ApiError("bad_response");
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(navigator.onLine === false ? "offline" : "network", String(e && e.message));
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBoot(raw) {
  const exercises = {};
  for (const e of raw.exercises || []) {
    const name = String(e.exercise ?? "").trim();
    if (!name) continue;
    exercises[norm(name)] = { ...e, exercise: name, bodyweight: truthy(e.bodyweight) };
  }
  return {
    client: {
      id: String(raw.client?.id ?? ""),
      name: String(raw.client?.name ?? ""),
      show_rir: raw.client?.show_rir !== false && raw.client?.show_rir !== "FALSE",
    },
    program: raw.program || [],
    exercises,
    log: (raw.log || []).map((r) => ({ ...r, set_type: r.set_type === "W" ? "W" : "N" })),
    sessions: raw.sessions || [],
    fetched_at: new Date().toISOString(),
  };
}

function demoDb() {
  let db = LS.get(DEMO_DB, null);
  if (!db) {
    db = DEMO.seedDb();
    LS.set(DEMO_DB, db);
  }
  return db;
}

export function resetDemo() {
  LS.del(DEMO_DB);
  LS.del(bootKey("demo"));
  LS.del(queueKey("demo"));
  LS.del("wt.active.demo");
}

export function cachedBoot(token) {
  return LS.get(bootKey(token), null);
}

export async function fetchBoot(token) {
  let raw;
  if (isDemo(token)) {
    const db = demoDb();
    raw = { client: DEMO.client, program: DEMO.program(), exercises: DEMO.exercises, log: db.log, sessions: db.sessions };
  } else {
    if (!API_URL) throw new ApiError("not_configured");
    const data = await fetchJson(`${API_URL}?action=bootstrap&token=${encodeURIComponent(token)}`, {}, 25000);
    if (!data.ok) throw new ApiError(data.error || "server_error", data.message);
    raw = data;
  }
  const boot = normalizeBoot(raw);
  LS.set(bootKey(token), boot);
  return boot;
}

/* ---------- write queue ---------- */

const listeners = new Set();
const status = { pending: 0, error: null, syncing: false };
let seq = Date.now();

export function onSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const syncStatus = () => ({ ...status });

function emit(token) {
  status.pending = pending(token).length;
  listeners.forEach((fn) => fn(syncStatus()));
}

export function pending(token) {
  return LS.get(queueKey(token), []);
}

const opKey = (op) => (op.type === "finish" ? `f:${op.instance_id}` : `s:${op.entry_id}`);

// Newer writes to the same set or session replace older ones still waiting.
export function enqueue(token, ops) {
  let q = pending(token);
  for (const op of [].concat(ops)) {
    const key = opKey(op);
    q = q.filter((o) => o.key !== key);
    q.push({ ...op, key, q: ++seq });
  }
  if (!LS.set(queueKey(token), q)) status.error = new ApiError("storage_full");
  emit(token);
}

let inflight = null;

export function flush(token) {
  if (!token) return Promise.resolve(false);
  if (inflight) return inflight;
  const q = pending(token);
  if (!q.length) {
    status.error = null;
    emit(token);
    return Promise.resolve(true);
  }
  status.syncing = true;
  emit(token);
  let ok = false;
  // Starts on the next tick so `inflight` is set before the body (which may not await) clears it.
  inflight = Promise.resolve().then(async () => {
    try {
      let applied;
      let rejected = [];
      if (isDemo(token)) {
        LS.set(DEMO_DB, applyOps(demoDb(), q));
        applied = q.map((o) => o.key);
      } else {
        if (!API_URL) throw new ApiError("not_configured");
        const data = await fetchJson(
          API_URL,
          {
            method: "POST",
            // text/plain keeps this a "simple" request, which Apps Script needs (no CORS preflight).
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ token, ops: q }),
          },
          30000,
        );
        if (!data.ok) throw new ApiError(data.error || "server_error", data.message);
        applied = data.applied || [];
        rejected = data.rejected || [];
      }
      const sent = new Map(q.map((o) => [o.key, o.q]));
      const appliedKeys = new Set(applied);
      // Rejected writes are malformed and would fail forever, so they're dropped too.
      const gone = new Set([...applied, ...rejected]);
      const done = q.filter((o) => appliedKeys.has(o.key));
      // Anything edited again while this request was out stays queued.
      LS.set(queueKey(token), pending(token).filter((o) => !(gone.has(o.key) && sent.get(o.key) === o.q)));
      const boot = cachedBoot(token);
      if (boot) LS.set(bootKey(token), { ...boot, ...applyOps(boot, done) });
      if (rejected.length) console.warn("Server rejected", rejected);
      status.error = null;
      ok = true;
      return true;
    } catch (e) {
      status.error = e;
      return false;
    } finally {
      inflight = null;
      status.syncing = false;
      emit(token);
      // Writes that arrived while this one was out go straight away, not on the next retry tick.
      if (ok && pending(token).length) setTimeout(() => flush(token), 0);
    }
  });
  return inflight;
}

export function startAutoFlush(token) {
  const kick = () => {
    if (pending(token).length) flush(token);
  };
  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
  });
  setInterval(kick, 20000);
  emit(token);
}
