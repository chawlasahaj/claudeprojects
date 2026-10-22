import { chrome, $, $$, esc, loadMeta, loadAgents, loadMcsts, store, picks, plural, fmtInt, fmtMonth, debounce, NO_DATA } from "./app.js";
import { shortlist, historyDays, sizeRange, MIN_HISTORY_DAYS } from "./lib/score.js";
import { postalDistrict, districtLabel } from "./lib/geo.js";

chrome("shortlist");

const [meta, agents, mcsts] = await Promise.all([loadMeta(), loadAgents(), loadMcsts()]);
if (!meta || !agents || !mcsts) {
  $("#no-data").innerHTML = NO_DATA;
  $("#finder").hidden = true;
} else {
  start();
}

function start() {

  const firmById = new Map(agents.map((a) => [a.id, a]));
  const index = mcsts.map((m) => ({ m, hay: `${m.name} ${m.postal} ${m.mcst}`.toLowerCase() }));
  $("#m-current").insertAdjacentHTML("beforeend", [...agents].sort((a, b) => a.name.localeCompare(b.name)).map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join(""));

  // ---- Picking the development ----
  const input = $("#dev-search");
  const list = $("#dev-list");
  let matches = [];
  let active = -1;

  function search(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) return [];
    const starts = [];
    const contains = [];
    for (const x of index) {
      if (x.m.name.toLowerCase().startsWith(q) || x.m.postal.startsWith(q)) starts.push(x.m);
      else if (x.hay.includes(q)) contains.push(x.m);
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }

  function showList() {
    list.hidden = !matches.length;
    input.setAttribute("aria-expanded", String(!!matches.length));
    list.innerHTML = matches
      .map((m, i) => `<li role="option" id="opt-${i}" data-i="${i}" aria-selected="${i === active}"><b>${esc(m.name)}</b><br><small>${esc(m.postal)} · MCST ${esc(m.mcst)}${m.lots ? ` · ${fmtInt(m.lots)} lots` : ""}</small></li>`)
      .join("");
    input.setAttribute("aria-activedescendant", active >= 0 ? `opt-${active}` : "");
  }

  input.addEventListener(
    "input",
    debounce(() => {
      matches = search(input.value);
      active = -1;
      showList();
    }, 80),
  );
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      showList();
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      matches = [];
      showList();
    }
  });
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) choose(matches[Number(li.dataset.i)]);
  });
  input.addEventListener("blur", () => setTimeout(() => ((matches = []), showList()), 150));

  function choose(m) {
    setTarget({ key: m.key, mcst: m.mcst, name: m.name, address: m.address, postal: m.postal, lat: m.lat, lng: m.lng, lots: m.lots, currentFirm: m.firm });
    input.value = "";
    matches = [];
    showList();
  }

  $("#manual-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const postal = $("#m-postal").value.trim();
    const lots = parseInt($("#m-lots").value, 10) || null;
    const same = mcsts.find((m) => m.postal === postal && m.lat != null);
    const coords = same ? { lat: same.lat, lng: same.lng } : await oneMap(postal);
    setTarget({ key: null, name: `Postal code ${postal}`, postal, lots, ...coords, currentFirm: $("#m-current").value || null });
  });

  async function oneMap(postal) {
    try {
      const r = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(postal)}&returnGeom=Y&getAddrDetails=N&pageNum=1`);
      const hit = (await r.json()).results?.find((x) => x.POSTAL === postal);
      if (hit) return { lat: Number(hit.LATITUDE), lng: Number(hit.LONGITUDE) };
    } catch {}
    return { lat: null, lng: null };
  }

  // ---- Showing the shortlist ----
  let target = store.get("target");
  // A saved development picks up the latest data: its location, size and agent may have changed.
  const saved = target?.key && mcsts.find((m) => m.key === target.key);
  if (saved) target = { ...target, postal: saved.postal, lat: saved.lat, lng: saved.lng, lots: saved.lots, currentFirm: saved.firm };

  function setTarget(t) {
    target = t;
    store.set("target", t);
    render();
    $("#chosen").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const opts = { radiusKm: 3, preference: "any", includeCurrent: false, size: "any", ...store.get("shortlistOptions", {}) };
  $("#o-size").value = opts.size;
  $("#o-radius").value = String(opts.radiusKm);
  $("#o-pref").value = opts.preference;
  $("#o-current").checked = opts.includeCurrent;
  for (const el of $$("#options select, #options input")) {
    el.addEventListener("change", () => {
      opts.radiusKm = Number($("#o-radius").value);
      opts.preference = $("#o-pref").value;
      opts.includeCurrent = $("#o-current").checked;
      // Only a change of the select itself, not one forced by a development of unknown size.
      if (!$("#o-size").disabled) opts.size = $("#o-size").value;
      store.set("shortlistOptions", opts);
      render();
    });
  }

  const useRetention = historyDays(meta.history) >= MIN_HISTORY_DAYS;
  const useAccreditation = !!meta.accreditation?.complete;

  function render() {
    if (!target) return;
    const current = target.currentFirm ? firmById.get(target.currentFirm) : null;
    const d = postalDistrict(target.postal);
    // The range goes under the select: in the option text it gets cut off on wide screens.
    $("#size-hint").textContent = target.lots ? `Similar size: ${sizeRange(target.lots).join("–")} strata lots` : "Your size isn't known, so every size counts";
    $("#o-size").disabled = !target.lots;
    $("#o-size").value = target.lots ? opts.size : "any";
    const sameSize = !!target.lots && opts.size === "similar";
    $("#chosen").hidden = false;
    $("#options").hidden = false;
    $("#chosen").innerHTML = `
      <div class="btn-row" style="justify-content: space-between">
        <div>
          <div class="eyebrow">Shortlist for</div>
          <h2 style="margin: 0">${esc(target.name)}</h2>
          <div class="muted">${[target.mcst ? `MCST ${esc(target.mcst)}` : "", target.lots ? `${fmtInt(target.lots)} strata lots` : "Size unknown", esc(districtLabel(d))].filter(Boolean).join(" · ")}</div>
          <div class="muted">Current agent: ${current ? `<a href="agent.html?id=${esc(current.id)}">${esc(current.name)}</a>` : "none listed"}</div>
        </div>
        <button class="btn quiet small" type="button" id="change">Change development</button>
      </div>`;
    $("#change").addEventListener("click", () => {
      $("#finder").scrollIntoView({ behavior: "smooth" });
      input.focus();
    });

    const results = shortlist(target, mcsts, agents, {
      radiusKm: opts.radiusKm,
      preference: opts.preference,
      excludeCurrent: !opts.includeCurrent,
      history: meta.history,
      accreditationComplete: useAccreditation,
      sameSize,
    });

    const used = ["nearby experience", target.lots && !sameSize ? "similar-size experience" : null, "portfolio size", useRetention ? "client retention" : null, useAccreditation ? "accreditation" : null].filter(Boolean);
    const notes = [];
    if (!target.lots) notes.push("We don't know your development's size, so size isn't used.");
    if (!useRetention) notes.push(meta.history ? `Client retention will count once we've tracked switches for 3 months (tracking since ${fmtMonth(meta.history.since)}).` : "Client retention will count once we've tracked switches for 3 months.");
    if (target.lat == null) notes.push("We couldn't place your postal code on the map, so “nearby” means the same postal district.");

    $("#results").innerHTML = `
      <h2>Agents worth asking for a quote</h2>
      <p class="muted">Ranked on public data: ${used.join(", ")}.${sameSize ? ` Only condos with ${sizeRange(target.lots).join("–")} strata lots count.` : ""} It's a starting point for getting quotes, not a rating of service quality. <a href="methodology.html">How it works</a></p>
      ${notes.length ? `<div class="notice" style="margin-bottom: 16px">${notes.map(esc).join(" ")}</div>` : ""}
      ${results.map((r) => card(r, sameSize)).join("") || `<div class="notice">No agents found. Try a larger distance${sameSize ? " or any size" : ""}.</div>`}
      <p class="muted" style="margin-top: 16px">Want more choice? <a href="agents.html">Browse every agent</a> and add any of them from their page.</p>`;
    for (const cb of $$("[data-pick]")) {
      cb.addEventListener("change", () => {
        picks.toggle(firmById.get(cb.dataset.pick));
        renderTray();
      });
    }
    renderTray();
  }

  function card(r, sameSize) {
    const f = r.firm;
    const id = esc(f.id);
    const nearby = r.nearby.slice(0, 12);
    return `<article class="card result">
      <div>
        <h3><a href="agent.html?id=${id}">${esc(f.name)}</a> ${f.accredited ? `<span class="badge">AMA</span>` : ""}</h3>
        <div class="muted">${plural(r.count, sameSize ? "similar-size condo" : "condo")}${r.count !== f.count ? ` (${fmtInt(f.count)} in total)` : ""}${f.units ? ` · ${fmtInt(f.units)} strata lots` : ""}</div>
      </div>
      <div class="score" title="Match score out of 100">${r.score}<small>match</small></div>
      <ul class="reasons">${r.reasons.map((x) => `<li class="${x.tone}">${esc(x.text)}</li>`).join("")}</ul>
      <div class="result-actions">
        <label class="check" style="margin: 0"><input type="checkbox" data-pick="${id}" ${picks.has(f.id) ? "checked" : ""}> Invite to quote</label>
        ${nearby.length ? `<details class="nearby"><summary>Their condos near you (${r.nearby.length})</summary>
          <ul>${nearby.map((m) => `<li>${esc(m.name)}${m.km != null ? ` · ${m.km.toFixed(1)} km` : ""}${m.lots ? ` · ${fmtInt(m.lots)} lots` : ""}</li>`).join("")}</ul>
          <p class="muted" style="margin: 8px 0 0">Good places to ask for a reference: write to the council, care of the management office.</p></details>` : ""}
      </div>
    </article>`;
  }

  function renderTray() {
    const n = picks.all().length;
    const tray = $("#tray");
    tray.hidden = n === 0;
    tray.innerHTML = `<span><b>${n}</b> agent${n === 1 ? "" : "s"} picked${n < 3 ? " · aim for 3 to 5" : ""}</span><a class="btn small" href="rfp.html">Build the RFP pack →</a>`;
  }

  render();
  renderTray();
}
