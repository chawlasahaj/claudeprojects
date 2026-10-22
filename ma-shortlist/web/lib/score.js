// Ranks managing agents for one development using public data only. The Methodology page
// explains each signal; keep the two in step.

import { between, postalDistrict } from "./geo.js";

export const WEIGHTS = { nearby: 35, similar: 15, retention: 20, accredited: 15, scale: 15 };
export const SIGNAL_LABELS = {
  nearby: "Nearby experience",
  similar: "Similar-size experience",
  retention: "Keeps its clients",
  accredited: "AMA (Registered) accredited",
  scale: "Portfolio size",
};
// Retention only counts once the history covers at least this long.
export const MIN_HISTORY_DAYS = 90;
// Firms managing fewer developments aren't suggested: many are developers or owners running
// their own building. They still appear in the directory.
export const MIN_PORTFOLIO = 3;

const logScore = (n, full) => Math.min(1, Math.log1p(n) / Math.log1p(full));

// Similar size: within half to double the target's strata lots.
export const sizeRange = (target) => [Math.ceil(target / 2), target * 2];
export function similarSize(lots, target) {
  return lots != null && target != null && lots >= target / 2 && lots <= target * 2;
}

export function scaleScore(count, preference = "any") {
  if (preference === "smaller") {
    if (count < 3) return 0.4;
    if (count <= 40) return 1;
    if (count <= 80) return 0.6;
    return 0.3;
  }
  if (preference === "larger") return count < 10 ? 0.2 : logScore(count - 10, 90);
  if (count < 3) return 0.2;
  if (count < 10) return 0.6;
  if (count < 30) return 0.9;
  return 1;
}

// Share of the clients it started with that it still has: 1 = lost none, 0 = lost a quarter or more.
export function retentionScore(h) {
  if (!h) return null;
  const start = h.startCount;
  if (!start) return null;
  return Math.max(0, 1 - (h.lost / start) * 4);
}

export function historyDays(history) {
  if (!history?.since || !history?.until) return 0;
  return (Date.parse(history.until) - Date.parse(history.since)) / 86400000;
}

/**
 * @param target  { lat, lng, postal, lots, currentFirm }
 * @param mcsts   [{ key, name, postal, lat, lng, lots, firm }]
 * @param firms   [{ id, name, count, accredited, history: { startCount, gained, lost } | null }]
 * @param opts    { radiusKm, preference, accreditationComplete, history: { since, until }, limit, excludeCurrent,
 *                  sameSize: count only developments of a similar size to the target (needs target.lots) }
 */
export function shortlist(target, mcsts, firms, opts = {}) {
  const radiusKm = opts.radiusKm ?? 3;
  const sameSize = !!opts.sameSize && !!target.lots;
  const limit = opts.limit ?? 6;
  const useRetention = historyDays(opts.history) >= MIN_HISTORY_DAYS;
  const useAccreditation = !!opts.accreditationComplete;
  const targetDistrict = postalDistrict(target.postal);
  const hasCoords = target.lat != null && target.lng != null;

  const byFirm = new Map();
  for (const m of mcsts) {
    if (!m.firm || m.key === target.key) continue;
    if (!byFirm.has(m.firm)) byFirm.set(m.firm, { nearby: [], similar: 0 });
    const agg = byFirm.get(m.firm);
    const similar = similarSize(m.lots, target.lots);
    if (similar) agg.similar++;
    if (sameSize && !similar) continue;
    const km = hasCoords ? between(target, m) : null;
    // Without coordinates on either side, the same postal district counts as nearby.
    const close = km != null ? km <= radiusKm : targetDistrict != null && postalDistrict(m.postal) === targetDistrict;
    if (close) agg.nearby.push({ ...m, km });
  }

  const results = [];
  for (const firm of firms) {
    const isCurrent = firm.id === target.currentFirm;
    if (opts.excludeCurrent !== false && isCurrent) continue;
    const agg = byFirm.get(firm.id) ?? { nearby: [], similar: 0 };
    // With "similar size only", the firm is judged on its developments of that size alone.
    const count = sameSize ? agg.similar : firm.count;
    if (!count || (count < (opts.minPortfolio ?? MIN_PORTFOLIO) && !isCurrent)) continue;
    agg.nearby.sort((a, b) => (a.km ?? 99) - (b.km ?? 99));
    const signals = {
      nearby: logScore(agg.nearby.length, 10),
      similar: target.lots && !sameSize ? logScore(agg.similar, 10) : null,
      retention: useRetention ? retentionScore(firm.history) : null,
      accredited: useAccreditation ? (firm.accredited ? 1 : 0) : null,
      scale: scaleScore(count, opts.preference),
    };
    let sum = 0;
    let weight = 0;
    for (const [k, v] of Object.entries(signals)) {
      if (v == null) continue;
      sum += WEIGHTS[k] * v;
      weight += WEIGHTS[k];
    }
    const score = weight ? Math.round((sum / weight) * 100) : 0;
    results.push({ firm, score, signals, count, nearby: agg.nearby, similarCount: agg.similar });
  }

  results.sort((a, b) => b.score - a.score || b.nearby.length - a.nearby.length || b.count - a.count);
  return results.slice(0, limit).map((r) => ({ ...r, reasons: reasons(r, target, { radiusKm, useRetention, history: opts.history, hasCoords, sameSize }) }));
}

const fmtMonth = (iso) => new Date(iso).toLocaleDateString("en-SG", { month: "short", year: "numeric" });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function reasons(r, target, ctx) {
  const out = [];
  const { firm, nearby, similarCount } = r;
  const noun = ctx.sameSize ? "similar-size condo" : "condo";
  const where = ctx.hasCoords ? `within ${ctx.radiusKm} km` : "in your postal district";
  if (nearby.length) {
    const closest = nearby[0];
    const dist = closest.km != null ? `, closest ${closest.km.toFixed(1)} km away` : "";
    out.push({ tone: "good", text: `Manages ${plural(nearby.length, noun)} ${where}${dist}` });
  } else {
    out.push({ tone: "neutral", text: `No ${noun}s ${where}` });
  }
  if (target.lots && similarCount && !ctx.sameSize) {
    const [lo, hi] = sizeRange(target.lots);
    out.push({ tone: "good", text: `${plural(similarCount, "condo")} of a similar size (${lo}–${hi} lots)` });
  }
  const h = firm.history;
  if (ctx.useRetention && h) {
    const since = fmtMonth(ctx.history.since);
    if (h.lost === 0) out.push({ tone: "good", text: `Lost no clients since ${since}${h.gained ? `, won ${h.gained}` : ""}` });
    else {
      const share = h.startCount ? h.lost / h.startCount : 0;
      out.push({
        tone: share >= 0.1 ? "warn" : "neutral",
        text: `Lost ${h.lost} of ${h.startCount} clients since ${since}${h.gained ? `, won ${h.gained}` : ""}`,
      });
    }
  }
  if (firm.accredited) out.push({ tone: "good", text: `AMA (Registered) accredited${firm.accredited.category ? `, Category ${firm.accredited.category}` : ""}` });
  const count = r.count ?? firm.count;
  out.push({ tone: "neutral", text: count === firm.count ? `Manages ${plural(firm.count, "condo")} in total` : `Manages ${plural(count, noun)}, ${firm.count} condos in total` });
  return out;
}
