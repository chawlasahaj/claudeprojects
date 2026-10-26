// Shared by every page: header and footer, data loading, saved state and formatting.

const NAV = [
  ["shortlist", "shortlist.html", "Shortlist"],
  ["agents", "agents.html", "Agents"],
  ["rfp", "rfp.html", "RFP pack"],
  ["compare", "compare.html", "Compare quotes"],
  ["guide", "guide.html", "Guide"],
];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function chrome(active) {
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `<div class="wrap">
    <a class="brand" href="./"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill-rule="evenodd" d="M16 3 30.5 15.5H27V29H5V15.5H1.5ZM13 29v-8h6v8Z"/></svg>StrataMatch</a>
    <nav class="site-nav" aria-label="Main">${NAV.map(([id, href, label]) => `<a href="${href}"${id === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  </div>`;
  document.body.prepend(header);

  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `<div class="wrap">
    <div>Not affiliated with BCA or any managing agent.</div>
    <div><a href="methodology.html">How the shortlist works</a> · <a href="about.html">About and data</a> <span id="data-date"></span></div>
  </div>`;
  document.body.append(footer);
  loadMeta()
    .then((m) => {
      if (m?.fetchedAt) $("#data-date").textContent = `· BCA data as of ${fmtDate(m.fetchedAt)}`;
    })
    .catch(() => {});
  sayHi(header);
  console.log("%cHi from Sahaj.", "font-weight: bold", "Curious how it works? The code's at https://github.com/chawlasahaj/claudeprojects");
}

// A one-time hello for visitors from LinkedIn: straight from linkedin.com, or through the
// "Came from LinkedIn?" link in the repo's README (?hi=linkedin). Nothing leaves the browser.
function sayHi(header) {
  const params = new URLSearchParams(location.search);
  let fromLinkedIn = params.get("hi") === "linkedin";
  try {
    fromLinkedIn ||= /(^|\.)linkedin\.com$|^lnkd\.in$/.test(new URL(document.referrer).hostname);
  } catch {}
  if (params.has("hi")) {
    params.delete("hi");
    history.replaceState(history.state, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
  }
  if (!fromLinkedIn || store.get("saidHi")) return;
  store.set("saidHi", true);
  const note = document.createElement("div");
  note.className = "wrap";
  note.innerHTML = `<div class="notice accent hello" role="status">
    <span>Hi, LinkedIn. Thanks for stopping by. <a href="shortlist.html">Try it on your own condo</a>.</span>
    <button type="button" aria-label="Close">×</button>
  </div>`;
  $("button", note).addEventListener("click", () => note.remove());
  header.after(note);
}

// Data files. Missing data (before the first refresh) resolves to null, not an error.
const cache = {};
async function getJson(name) {
  cache[name] ??= fetch(`data/${name}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return cache[name];
}
export const loadMeta = () => getJson("meta.json");
export const loadAgents = () => getJson("agents.json");
export async function loadMcsts() {
  const t = await getJson("mcst.json");
  if (!t) return null;
  return t.rows.map((r) => Object.fromEntries(t.cols.map((c, i) => [c, r[i]])));
}

export const NO_DATA = `<div class="notice warn"><b>The managing agent data isn't loaded yet.</b> It's refreshed from BCA's list on data.gov.sg every month. Please try again later.</div>`;

// Saved state lives only in this browser. Every read and write tolerates storage being blocked.
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(`mas.${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`mas.${key}`, JSON.stringify(value));
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem(`mas.${key}`);
    } catch {}
  },
};

// The firms a council has picked, shared by the Shortlist, Agent, RFP and Compare pages.
export const picks = {
  all: () => store.get("picks", []),
  has: (id) => picks.all().some((p) => p.id === id),
  toggle(firm) {
    const list = picks.all();
    const next = list.some((p) => p.id === firm.id) ? list.filter((p) => p.id !== firm.id) : [...list, { id: firm.id, name: firm.name }];
    store.set("picks", next);
    return next;
  },
};

export function fmtDate(iso, opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("en-SG", opts);
}
export const fmtMonth = (iso) => fmtDate(iso, { month: "short", year: "numeric" });
export const fmtInt = (n) => (n == null ? "–" : Math.round(n).toLocaleString("en-SG"));
export const fmtMoney = (n, dp = 0) => (n == null || !Number.isFinite(n) ? "–" : `S$${n.toLocaleString("en-SG", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const plural = (n, one, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  if (button) {
    const old = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = old), 1500);
  }
}

// Prints only one part of the page (e.g. the RFP document).
export function printOnly(el) {
  el.classList.add("print-target");
  document.body.classList.add("printing-doc");
  const done = () => {
    document.body.classList.remove("printing-doc");
    el.classList.remove("print-target");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
