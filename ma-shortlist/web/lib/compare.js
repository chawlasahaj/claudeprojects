// The standard price schedule every agent fills in, and the maths that puts quotes side by side.
// The RFP pack prints these fields as Annex A, so what agents send back maps straight onto the
// Compare page.

export const GST_RATE = 0.09;

export const QUOTE_FIELDS = [
  { id: "managementFee", label: "Management fee", unit: "S$ / month", kind: "money", required: true },
  { id: "staffCost", label: "On-site staff costs charged on top of the fee", unit: "S$ / month", kind: "money", hint: "0 if included in the fee" },
  { id: "otherMonthly", label: "Other monthly charges (software, resident app, etc.)", unit: "S$ / month", kind: "money" },
  { id: "meetingCost", label: "Charge per general meeting (AGM or EGM)", unit: "S$ each", kind: "money" },
  { id: "otherAnnual", label: "Other yearly charges (audit support, tax filing, etc.)", unit: "S$ / year", kind: "money" },
  { id: "disbursements", label: "Estimated disbursements (printing, postage, bank charges, etc.)", unit: "S$ / year", kind: "money" },
  { id: "managerHours", label: "Condo manager on site", unit: "hours / week", kind: "number", required: true },
  { id: "otherStaff", label: "Other on-site staff (admin, assistant)", unit: "people", kind: "number" },
  { id: "termMonths", label: "Contract term", unit: "months", kind: "number", required: true },
  { id: "noticeMonths", label: "Notice to end the contract early", unit: "months", kind: "number" },
  { id: "escalation", label: "Fee increase each year", unit: "% / year", kind: "number" },
  { id: "gst", label: "Prices exclude GST and the firm charges GST", kind: "bool" },
];

export const RATINGS = [
  { id: "manpower", label: "Manpower and experience", hint: "Proposed condo manager's experience, staffing, back-office support" },
  { id: "references", label: "References and track record", hint: "What their current and past clients told you" },
  { id: "proposal", label: "Quality of proposal", hint: "Understood your estate, clear answers, sensible contract terms" },
];

export const DEFAULT_WEIGHTS = { price: 40, manpower: 25, references: 20, proposal: 15 };
export const WEIGHT_LABELS = { price: "Price", ...Object.fromEntries(RATINGS.map((r) => [r.id, r.label])) };

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

/**
 * Turns one quote into comparable yearly figures.
 * @param q     values keyed by QUOTE_FIELDS ids
 * @param opts  { units, meetingsPerYear = 1 }
 */
export function normaliseQuote(q, { units, meetingsPerYear = 1 } = {}) {
  const gst = q.gst ? 1 + GST_RATE : 1;
  const monthly = num(q.managementFee) + num(q.staffCost) + num(q.otherMonthly);
  const yearlyExtras = num(q.meetingCost) * meetingsPerYear + num(q.otherAnnual) + num(q.disbursements);
  const annual = (monthly * 12 + yearlyExtras) * gst;
  const hours = num(q.managerHours);
  const term = Math.max(0, Math.round(num(q.termMonths)));
  const esc = num(q.escalation) / 100;
  let termTotal = 0;
  for (let m = 0; m < term; m++) termTotal += (annual / 12) * (1 + esc) ** Math.floor(m / 12);

  return {
    monthly: monthly * gst,
    annual,
    perUnitMonth: units > 0 ? annual / 12 / units : null,
    perManagerHour: hours > 0 ? (monthly * 12 * gst) / (hours * 52) : null,
    termTotal: term ? termTotal : null,
    missing: QUOTE_FIELDS.filter((f) => f.required && isBlank(q[f.id])).map((f) => f.label),
  };
}

/**
 * Scores quotes 0-100: price against the cheapest quote, the council's 1-5 ratings for the rest.
 * @param quotes   [{ name, values, ratings: { manpower, references, proposal } }]
 */
export function scoreQuotes(quotes, weights = DEFAULT_WEIGHTS, opts = {}) {
  const rows = quotes.map((q) => ({ ...q, norm: normaliseQuote(q.values ?? {}, opts) }));
  const priced = rows.map((r) => r.norm.annual).filter((a) => a > 0);
  const cheapest = priced.length ? Math.min(...priced) : 0;

  for (const r of rows) {
    const parts = {
      price: r.norm.annual > 0 ? (cheapest / r.norm.annual) * 100 : null,
      ...Object.fromEntries(RATINGS.map(({ id }) => {
        const v = num(r.ratings?.[id]);
        return [id, v >= 1 && v <= 5 ? ((v - 1) / 4) * 100 : null];
      })),
    };
    let sum = 0;
    let weight = 0;
    for (const [k, v] of Object.entries(parts)) {
      if (v == null || !weights[k]) continue;
      sum += weights[k] * v;
      weight += weights[k];
    }
    r.parts = parts;
    r.total = weight ? Math.round(sum / weight) : null;
    r.scoredOn = weight;
  }
  const ranked = rows.filter((r) => r.total != null).sort((a, b) => b.total - a.total);
  ranked.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
