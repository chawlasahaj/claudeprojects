import { chrome, $, $$, esc, store, picks, fmtDate, fmtInt, copyText, printOnly, download, loadAgents } from "./app.js";
import { SCOPE_ITEMS, SUBMISSION_ITEMS, buildTimeline, emailText, addMonths, parseDate, iso } from "./lib/rfp.js";
import { QUOTE_FIELDS, DEFAULT_WEIGHTS, WEIGHT_LABELS } from "./lib/compare.js";

chrome("rfp");

const TEXT_FIELDS = ["development", "mcstNo", "units", "blocks", "top", "currentAgent", "address", "facilities", "startDate", "noticeMonths", "openWeeks", "termMonths", "extraScope", "managerType", "managerHours", "otherStaff", "invited", "contactName", "contactEmail"];

// ---- Load saved state, filling gaps from the shortlist ----
const target = store.get("target");
const agents = (await loadAgents()) ?? [];
const currentName = target?.currentFirm ? agents.find((a) => a.id === target.currentFirm)?.name : "";
const defaultStart = iso(addMonths(new Date(), 6)).slice(0, 8) + "01";
const state = {
  development: target?.name?.startsWith("Postal code") ? "" : target?.name ?? "",
  mcstNo: target?.mcst ?? "",
  units: target?.lots ?? "",
  address: target?.address ?? "",
  currentAgent: currentName ?? "",
  startDate: defaultStart,
  noticeMonths: 3,
  openWeeks: 4,
  termMonths: 24,
  managerType: "full",
  managerHours: 44,
  needsGM: true,
  scope: Object.fromEntries(SCOPE_ITEMS.map((s) => [s.id, s.on])),
  ...store.get("rfp", {}),
};
// The shortlist is the source of truth for who's invited until the council edits the list here.
if (!state.invitedEdited) state.invited = picks.all().map((p) => p.name).join("\n");
let weights = store.get("weights", DEFAULT_WEIGHTS);

for (const id of TEXT_FIELDS) if (state[id] != null) $(`#${id}`).value = state[id];
$("#needsGM").checked = state.needsGM !== false;
$("#scope").insertAdjacentHTML(
  "beforeend",
  SCOPE_ITEMS.map((s) => `<label class="check"><input type="checkbox" data-scope="${s.id}" ${state.scope[s.id] ? "checked" : ""}><span><b>${esc(s.label)}</b><span class="hint">${esc(s.detail)}</span></span></label>`).join(""),
);
$("#weight-fields").innerHTML = Object.entries(WEIGHT_LABELS)
  .map(([k, label]) => `<div class="field"><label for="w-${k}">${esc(label)}</label><input id="w-${k}" data-weight="${k}" type="number" min="0" max="100" value="${weights[k] ?? 0}"></div>`)
  .join("");

$("#rfp-form").addEventListener("input", (e) => {
  for (const id of TEXT_FIELDS) state[id] = $(`#${id}`).value;
  if (e.target.id === "invited") state.invitedEdited = true;
  state.needsGM = $("#needsGM").checked;
  for (const cb of $$("[data-scope]")) state.scope[cb.dataset.scope] = cb.checked;
  weights = Object.fromEntries($$("[data-weight]").map((el) => [el.dataset.weight, Math.max(0, Number(el.value) || 0)]));
  store.set("rfp", state);
  store.set("weights", weights);
  render();
});

$("#reset").addEventListener("click", () => {
  if (!confirm("Clear everything on this page?")) return;
  store.remove("rfp");
  location.reload();
});
$("#print").addEventListener("click", () => printOnly($("#doc")));
$("#email").addEventListener("click", (e) => copyText(email(), e.currentTarget));
$("#word").addEventListener("click", () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title())}</title>
    <style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.4}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4pt 6pt;text-align:left;vertical-align:top}th{background:#eee}h1{font-size:16pt}h2{font-size:13pt;margin-top:16pt}</style>
    </head><body>${$("#doc").innerHTML}</body></html>`;
  download(`${title().replace(/[\\/:*?"<>|]+/g, "")}.doc`, html, "application/msword");
});

// ---- The document ----
const val = (v, blank = "[to fill in]") => (String(v ?? "").trim() ? esc(v) : `<span style="color:#a15c00">${blank}</span>`);
const title = () => `Request for Proposal - Managing Agent Services - ${state.development || "Development"}`;
const timeline = () =>
  buildTimeline(state.startDate, { noticeMonths: Number(state.noticeMonths) || 0, openWeeks: Number(state.openWeeks) || 4, needsGeneralMeeting: state.needsGM !== false });
const stepDate = (t, id) => t?.steps.find((s) => s.id === id)?.date;

function email() {
  const t = timeline();
  return emailText({
    development: state.development,
    mcstNo: state.mcstNo,
    closeDate: stepDate(t, "close") ? fmtDate(stepDate(t, "close")) : "",
    siteVisit: stepDate(t, "siteVisits") ? `or around ${fmtDate(stepDate(t, "siteVisits"))}` : "",
    contactName: state.contactName,
    contactEmail: state.contactEmail,
  });
}

function render() {
  const t = timeline();
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  $("#weight-sum").innerHTML = sum === 100 ? `Total: 100` : `<span class="missing">Total: ${sum}. Make it add up to 100.</span>`;

  $("#timeline").innerHTML = t
    ? `${t.startsInPast ? `<div class="notice warn" style="margin: 8px 0 12px">This timeline would have started in the past. Pick a later start date, shorten the reply period, or check whether the current agent will accept shorter notice.</div>` : ""}
       <ol class="timeline">${t.steps.map((s) => `<li><time datetime="${s.date}">${esc(fmtDate(s.date))}</time><span>${esc(s.label)}${s.note ? `<br><small class="muted">${esc(s.note)}</small>` : ""}</span></li>`).join("")}</ol>`
    : `<p class="muted">Pick a start date to see the timeline.</p>`;

  const scope = SCOPE_ITEMS.filter((s) => state.scope[s.id]);
  const units = Number(state.units) || null;
  const manager = state.managerType === "part" ? `A part-time condo manager on site for ${val(state.managerHours)} hours a week.` : `A full-time condo manager on site (${val(state.managerHours)} hours a week).`;

  $("#doc").innerHTML = `
    <h1>Request for Proposal: Managing Agent Services</h1>
    <p><b>${val(state.development, "[development name]")}</b>${state.mcstNo ? `, Management Corporation Strata Title Plan No. ${esc(state.mcstNo)}` : ""}<br>
    Issued by the council${stepDate(t, "issue") ? ` on ${esc(fmtDate(stepDate(t, "issue")))}` : ""}. Proposals due by <b>${stepDate(t, "close") ? esc(fmtDate(stepDate(t, "close"))) : "[closing date]"}</b>.</p>

    <h2>1. Introduction</h2>
    <p>The council invites proposals for managing agent services for ${val(state.development, "the development")}, starting on <b>${state.startDate ? esc(fmtDate(state.startDate)) : "[start date]"}</b> for an initial term of ${val(state.termMonths)} months. Please read this document in full and complete the price schedule in Annex A. Proposals that leave out the price schedule may not be considered.</p>

    <h2>2. About the development</h2>
    <table>
      <tr><th style="width: 34%">Address</th><td>${val(state.address)}</td></tr>
      <tr><th>Units (strata lots)</th><td>${units ? fmtInt(units) : val("")}</td></tr>
      <tr><th>Blocks</th><td>${val(state.blocks)}</td></tr>
      <tr><th>Year completed (TOP)</th><td>${val(state.top)}</td></tr>
      <tr><th>Facilities</th><td>${val(state.facilities)}</td></tr>
      <tr><th>Current managing agent</th><td>${val(state.currentAgent, "-")}</td></tr>
    </table>

    <h2>3. Scope of services</h2>
    <p>The managing agent will carry out the duties of a managing agent under the Building (Strata Management) Act 2004 and its regulations, as delegated by the management corporation, including:</p>
    <ol>${scope.map((s) => `<li><b>${esc(s.label)}.</b> ${esc(s.detail)}</li>`).join("")}${state.extraScope ? `<li><b>Also:</b> ${esc(state.extraScope)}</li>` : ""}</ol>

    <h2>4. On-site staff</h2>
    <p>${manager}${state.otherStaff ? ` Other staff: ${esc(state.otherStaff)}.` : ""} Please state the staff you propose, their hours, and who covers leave and absences.</p>

    <h2>5. Timeline</h2>
    ${t ? `<table><tr><th style="width: 34%">Date</th><th>Step</th></tr>${t.steps.filter((s) => !["prep", "meetingNotice", "notice"].includes(s.id)).map((s) => `<tr><td>${esc(fmtDate(s.date))}</td><td>${esc(s.label)}</td></tr>`).join("")}</table>
      <p>Dates after the closing date are the council's plan and may change.</p>` : `<p>${val("")}</p>`}

    <h2>6. What to include in your proposal</h2>
    <ol>${SUBMISSION_ITEMS.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>

    <h2>7. How proposals will be evaluated</h2>
    <table><tr><th>Criterion</th><th style="width: 20%">Weight</th></tr>
      ${Object.entries(WEIGHT_LABELS).map(([k, label]) => `<tr><td>${esc(label)}</td><td>${weights[k] ?? 0}%</td></tr>`).join("")}
    </table>
    <p>The council may interview shortlisted firms and contact the references given. The council is not bound to accept the lowest-priced or any proposal.</p>

    <h2>8. Terms</h2>
    <ul>
      <li>Proposals should remain valid for 90 days after the closing date.</li>
      <li>${state.needsGM !== false ? "The appointment is subject to approval by resolution at a general meeting of the management corporation." : "The council has been authorised by the subsidiary proprietors to appoint a managing agent."}</li>
      <li>Send questions by email. Answers will be shared with every firm invited, so all proposals are made on the same information.</li>
      <li>The management corporation will not pay for preparing proposals. Information in proposals will be used only for this selection.</li>
    </ul>

    <h2>9. Contact</h2>
    <p>${val(state.contactName, "[name]")}, for the council<br>${val(state.contactEmail, "[email]")}</p>

    <h2 style="break-before: page">Annex A: Price schedule</h2>
    <p>Please fill in every line, in Singapore dollars. Write 0 where something is included in the management fee, and list anything not covered here on a separate sheet.</p>
    <table>
      <tr><th>Item</th><th style="width: 22%">Unit</th><th style="width: 26%">Your figure</th></tr>
      ${QUOTE_FIELDS.map((f) => `<tr><td>${esc(f.label)}${f.hint ? ` <small>(${esc(f.hint)})</small>` : ""}</td><td>${esc(f.kind === "bool" ? "Yes / No" : f.unit)}</td><td class="fill">&nbsp;</td></tr>`).join("")}
    </table>
    <p>Please also attach: what the management fee covers; each disbursement you charge and how; and a staff deployment schedule.</p>`;
}

render();
