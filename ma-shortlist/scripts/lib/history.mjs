// Compares the earliest and latest snapshots of who manages each MCST to see which
// developments switched agent. Names are resolved with today's alias table, so a firm
// that only changed the spelling of its name doesn't look like a switch.

/**
 * @param earliest  { date, agents: { [mcstKey]: rawMaName } }
 * @param latest    { date, agents: { ... } }
 * @param resolve   raw name -> { id } | null
 */
export function diffHistory(earliest, latest, resolve) {
  const id = (raw) => (raw ? resolve(raw)?.id ?? null : null);
  const startCount = {};
  for (const raw of Object.values(earliest.agents)) {
    const f = id(raw);
    if (f) startCount[f] = (startCount[f] ?? 0) + 1;
  }

  const moves = [];
  const newDevelopments = {};
  for (const [key, raw] of Object.entries(latest.agents)) {
    const to = id(raw);
    if (!(key in earliest.agents)) {
      if (to) newDevelopments[to] = (newDevelopments[to] ?? 0) + 1;
      continue;
    }
    const from = id(earliest.agents[key]);
    if (from !== to) moves.push({ key, from, to });
  }

  const perFirm = {};
  const firm = (f) => (perFirm[f] ??= { startCount: startCount[f] ?? 0, gained: 0, lost: 0, newDevelopments: newDevelopments[f] ?? 0, in: [], out: [] });
  for (const f of Object.keys(startCount)) firm(f);
  for (const f of Object.keys(newDevelopments)) firm(f);
  for (const m of moves) {
    if (m.from) {
      firm(m.from).lost++;
      firm(m.from).out.push({ key: m.key, to: m.to });
    }
    if (m.to) {
      firm(m.to).gained++;
      firm(m.to).in.push({ key: m.key, from: m.from });
    }
  }
  return { since: earliest.date, until: latest.date, switches: moves.length, perFirm };
}

export function sameAgents(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}
