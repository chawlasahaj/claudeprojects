import { chrome, $, $$, esc, store, picks, fmtMoney, fmtDate, printOnly } from "./app.js";
import { QUOTE_FIELDS, RATINGS, DEFAULT_WEIGHTS, WEIGHT_LABELS, scoreQuotes } from "./lib/compare.js";

chrome("compare");

const rfp = store.get("rfp", {});
const target = store.get("target");
const newQuote = (name = "") => ({ id: Math.random().toString(36).slice(2, 9), name, values: { gst: true }, ratings: {}, notes: "" });

function initialQuotes() {
  const names = String(rfp.invited ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const fromPicks = picks.all().map((p) => p.name);
  const list = names.length ? names : fromPicks;
  return (list.length ? list : ["", "", ""]).map(newQuote);
}

const state = store.get("compare") ?? { units: rfp.units || target?.lots || "", meetings: 1, quotes: initialQuotes() };
let weights = store.get("weights", DEFAULT_WEIGHTS);
const save = () => store.set("compare", state);

$("#units").value = state.units ?? "";
$("#meetings").value = state.meetings ?? 1;
$("#weight-fields").innerHTML = Object.entries(WEIGHT_LABELS)
  .map(([k, label]) => `<div class="field"><label for="w-${k}">${esc(label)}</label><input id="w-${k}" data-weight="${k}" type="number" min="0" max="100" value="${weights[k] ?? 0}"></div>`)
  .join("");

$("#settings").addEventListener("input", () => {
  state.units = $("#units").value;
  state.meetings = $("#meetings").value;
  weights = Object.fromEntries($$("[data-weight]").map((el) => [el.dataset.weight, Math.max(0, Number(el.value) || 0)]));
  store.set("weights", weights);
  save();
  renderResults();
});

// ---- Quote cards: drawn once, then edited in place so typing never loses focus ----
function quoteCard(q, i) {
  const field = (f) => {
    const id = `${q.id}-${f.id}`;
    if (f.kind === "bool") return `<label class="check" style="grid-column: 1 / -1"><input type="checkbox" id="${id}" data-q="${q.id}" data-f="${f.id}" ${q.values[f.id] ? "checked" : ""}> ${esc(f.label)}</label>`;
    return `<div class="field"><label for="${id}">${esc(f.label)} <span class="hint">${esc(f.unit)}${f.hint ? ` · ${esc(f.hint)}` : ""}</span></label>
      <input id="${id}" type="text" inputmode="decimal" data-q="${q.id}" data-f="${f.id}" value="${esc(q.values[f.id] ?? "")}"></div>`;
  };
  const rating = (r) => {
    const id = `${q.id}-r-${r.id}`;
    return `<div class="field"><label for="${id}">${esc(r.label)} <span class="hint">${esc(r.hint)}</span></label>
      <select id="${id}" data-q="${q.id}" data-r="${r.id}"><option value="">Not rated</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${String(q.ratings[r.id] ?? "") === String(n) ? "selected" : ""}>${n}${n === 1 ? " · poor" : n === 3 ? " · fair" : n === 5 ? " · excellent" : ""}</option>`).join("")}</select></div>`;
  };
  return `<section class="card quote-card" data-card="${q.id}">
    <h3><span>Quote ${i + 1}</span><button class="btn quiet small" type="button" data-remove="${q.id}">Remove</button></h3>
    <div class="field"><label for="${q.id}-name">Agent</label><input id="${q.id}-name" type="text" data-q="${q.id}" data-name value="${esc(q.name)}"></div>
    <div class="fields">${QUOTE_FIELDS.map(field).join("")}</div>
    <div class="fields">${RATINGS.map(rating).join("")}</div>
    <div class="field"><label for="${q.id}-notes">Notes</label><textarea id="${q.id}-notes" data-q="${q.id}" data-notes>${esc(q.notes)}</textarea></div>
  </section>`;
}

function renderQuotes() {
  $("#quotes").innerHTML = state.quotes.map(quoteCard).join("");
}

$("#quotes").addEventListener("input", (e) => {
  const el = e.target;
  const q = state.quotes.find((x) => x.id === el.dataset.q);
  if (!q) return;
  if (el.dataset.f) q.values[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
  else if (el.dataset.r) q.ratings[el.dataset.r] = el.value;
  else if ("name" in el.dataset) q.name = el.value;
  else if ("notes" in el.dataset) q.notes = el.value;
  save();
  renderResults();
});
$("#quotes").addEventListener("click", (e) => {
  const id = e.target.dataset?.remove;
  if (!id) return;
  const q = state.quotes.find((x) => x.id === id);
  if ((q.name || Object.keys(q.values).length > 1) && !confirm(`Remove ${q.name || "this quote"}?`)) return;
  state.quotes = state.quotes.filter((x) => x.id !== id);
  save();
  renderQuotes();
  renderResults();
});
$("#add").addEventListener("click", () => {
  state.quotes.push(newQuote());
  save();
  renderQuotes();
  renderResults();
  $(`[data-card="${state.quotes.at(-1).id}"] input`).focus();
});
$("#clear").addEventListener("click", () => {
  if (!confirm("Clear every quote on this page?")) return;
  store.remove("compare");
  location.reload();
});
$("#print").addEventListener("click", () => printOnly($("#summary")));

// ---- Results ----
function renderResults() {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  $("#weight-sum").innerHTML = sum === 100 ? "Total: 100" : `<span class="missing">Total: ${sum}. Make it add up to 100.</span>`;
  const units = Number(state.units) || 0;
  const rows = scoreQuotes(state.quotes, weights, { units, meetingsPerYear: Number(state.meetings) || 0 });
  const dev = rfp.development || target?.name || "";
  $(".print-only-note").textContent = `${dev ? `${dev} · ` : ""}${units ? `${units} units · ` : ""}prepared ${fmtDate(new Date().toISOString())} · weights: ${Object.entries(WEIGHT_LABELS).map(([k, l]) => `${l} ${weights[k] ?? 0}%`).join(", ")}`;

  const cols = [
    ["Agent", (r) => `<b>${esc(r.name || "Unnamed")}</b>${r.norm.missing.length ? `<br><span class="missing">Missing: ${esc(r.norm.missing.join(", "))}</span>` : ""}`],
    ["Yearly cost", (r) => fmtMoney(r.norm.annual || null), true],
    ["Per unit / month", (r) => fmtMoney(r.norm.perUnitMonth, 2), true],
    ["Per manager-hour", (r) => fmtMoney(r.norm.perManagerHour, 2), true],
    ["Over the term", (r) => fmtMoney(r.norm.termTotal), true],
    ["Price score", (r) => (r.parts.price == null ? "–" : Math.round(r.parts.price)), true],
    ...RATINGS.map((x) => [x.label.split(" ")[0], (r) => (r.ratings?.[x.id] ? `${r.ratings[x.id]}/5` : "–"), true]),
    ["Total", (r) => (r.total == null ? "–" : `<b>${r.total}</b>`), true],
    ["Rank", (r) => r.rank ?? "–", true],
  ];
  $("#results").innerHTML = `<thead><tr>${cols.map(([h, , n]) => `<th${n ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr class="${r.rank === 1 ? "rank-1" : ""}">${cols.map(([, f, n]) => `<td${n ? ' class="num"' : ""}>${f(r)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}">Add a quote below.</td></tr>`}</tbody>`;
}

renderQuotes();
renderResults();
