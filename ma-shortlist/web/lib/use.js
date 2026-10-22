// Development types (the "use" column in mcst.json, worked out by scripts/lib/landuse.mjs)
// and the groups a council can compare with.

export const USE_LABELS = {
  home: "Residential",
  mixed: "Mixed use",
  commercial: "Commercial",
  industrial: "Industrial",
};

// Mixed-use developments have homes above shops, so they count with both.
export const GROUPS = {
  home: { noun: "residential development", uses: ["home", "mixed"], note: "Only condos, apartments and mixed-use developments count, not offices, shops or factories." },
  commercial: { noun: "commercial development", uses: ["commercial", "mixed"], note: "Only offices, shops and mixed-use developments count." },
  industrial: { noun: "industrial development", uses: ["industrial"], note: "Only industrial developments count." },
  all: { noun: "development", uses: null, note: "Every type of development counts: homes, offices, shops and factories." },
};

export const inGroup = (use, group) => !GROUPS[group]?.uses || GROUPS[group].uses.includes(use);

// The group a development is compared with by default. Most councils using the site run
// condos, so a development of unknown type is treated as one.
export const groupFor = (use) => (use === "commercial" || use === "industrial" ? use : "home");

// How many of a firm's developments are in a group. Without type data, every one counts.
export function groupCount(firm, group) {
  const uses = GROUPS[group]?.uses;
  if (!uses || !firm.byUse) return firm.count;
  return uses.reduce((n, u) => n + (firm.byUse[u] ?? 0), 0);
}
