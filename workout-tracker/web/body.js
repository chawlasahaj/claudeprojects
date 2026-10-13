// A simple front/back body figure for the "Target Muscles" cards. Each card
// crops the figure around one muscle and paints it in the accent colour.

// Shapes for the left side; `pair` muscles are mirrored onto the right.
// e = ellipse [cx, cy, rx, ry], r = rect [x, y, w, h, radius], p = path d.
const MUSCLES = {
  delts: { view: "front", pair: true, focus: [100, 96], shapes: [["e", 58, 84, 12, 13]] },
  chest: { view: "front", pair: true, focus: [100, 98], shapes: [["p", "M98 80 Q80 75 68 86 Q65 101 74 108 Q88 113 98 106 Z"]] },
  biceps: { view: "front", pair: true, focus: [100, 118], shapes: [["e", 48, 118, 8, 20]] },
  forearms: { view: "front", pair: true, focus: [100, 182], shapes: [["e", 43, 182, 7, 24]] },
  abs: { view: "front", pair: false, focus: [100, 146], shapes: [["r", 89, 113, 22, 66, 7]] },
  obliques: { view: "front", pair: true, focus: [100, 148], shapes: [["e", 78, 148, 7, 22]] },
  quads: { view: "front", pair: true, focus: [100, 258], shapes: [["e", 84, 258, 12, 42]] },
  adductors: { view: "front", pair: true, focus: [100, 236], shapes: [["e", 96.5, 232, 4.5, 22]] },
  shins: { view: "front", pair: true, focus: [100, 348], shapes: [["e", 84, 348, 8, 30]] },
  traps: { view: "back", pair: false, focus: [100, 92], shapes: [["p", "M100 62 L124 78 L108 92 L100 118 L92 92 L76 78 Z"]] },
  reardelts: { view: "back", pair: true, focus: [100, 96], shapes: [["e", 58, 84, 12, 13]] },
  upperback: { view: "back", pair: true, focus: [100, 108], shapes: [["p", "M97 96 L84 93 L80 112 L97 121 Z"]] },
  lats: { view: "back", pair: true, focus: [100, 132], shapes: [["e", 79, 133, 10, 28]] },
  triceps: { view: "back", pair: true, focus: [100, 118], shapes: [["e", 48, 118, 8, 20]] },
  lowerback: { view: "back", pair: false, focus: [100, 168], shapes: [["r", 90, 150, 20, 38, 6]] },
  glutes: { view: "back", pair: true, focus: [100, 214], shapes: [["e", 86, 214, 15, 16]] },
  hamstrings: { view: "back", pair: true, focus: [100, 268], shapes: [["e", 85, 268, 12, 36]] },
  calves: { view: "back", pair: true, focus: [100, 344], shapes: [["e", 85, 344, 10, 28]] },
};

const ALIAS = {
  chest: "chest", pecs: "chest", pec: "chest", "upper chest": "chest", "lower chest": "chest",
  delts: "delts", shoulders: "delts", shoulder: "delts", "front delts": "delts", "front delt": "delts",
  "side delts": "delts", "side delt": "delts", "lateral delts": "delts", "anterior delts": "delts",
  "rear delts": "reardelts", "rear delt": "reardelts", "posterior delts": "reardelts",
  biceps: "biceps", bicep: "biceps", brachialis: "biceps",
  triceps: "triceps", tricep: "triceps",
  forearms: "forearms", forearm: "forearms", grip: "forearms",
  abs: "abs", core: "abs", abdominals: "abs", "rectus abdominis": "abs",
  obliques: "obliques", oblique: "obliques",
  quads: "quads", quadriceps: "quads", quad: "quads",
  adductors: "adductors", adductor: "adductors", "inner thighs": "adductors", "inner thigh": "adductors",
  hamstrings: "hamstrings", hamstring: "hamstrings", hams: "hamstrings",
  glutes: "glutes", glute: "glutes", "glute max": "glutes", "glute med": "glutes", hips: "glutes",
  calves: "calves", calf: "calves",
  shins: "shins", tibialis: "shins",
  lats: "lats", lat: "lats", back: "lats", "latissimus dorsi": "lats",
  "upper back": "upperback", rhomboids: "upperback", "mid back": "upperback", "middle back": "upperback",
  traps: "traps", trapezius: "traps", "upper traps": "traps",
  "lower back": "lowerback", erectors: "lowerback", "spinal erectors": "lowerback",
};

const SILHOUETTE = [
  ["e", 100, 34, 17, 20],
  ["r", 91, 50, 18, 16, 4],
  ["p", "M66 70 Q100 60 134 70 L142 84 Q138 130 128 172 Q130 190 132 206 L68 206 Q70 190 72 172 Q62 130 58 84 Z"],
  ["r", 38, 74, 20, 80, 10], ["r", 142, 74, 20, 80, 10],
  ["r", 34, 150, 18, 72, 9], ["r", 148, 150, 18, 72, 9],
  ["e", 43, 230, 8, 10], ["e", 157, 230, 8, 10],
  ["r", 70, 198, 29, 114, 14], ["r", 101, 198, 29, 114, 14],
  ["r", 73, 306, 23, 90, 11], ["r", 104, 306, 23, 90, 11],
  ["e", 84, 402, 13, 6], ["e", 116, 402, 13, 6],
];

function shape(s, cls, mirror) {
  const t = mirror ? ' transform="matrix(-1 0 0 1 200 0)"' : "";
  const c = cls ? ` class="${cls}"` : "";
  if (s[0] === "e") return `<ellipse${c}${t} cx="${s[1]}" cy="${s[2]}" rx="${s[3]}" ry="${s[4]}"/>`;
  if (s[0] === "r") return `<rect${c}${t} x="${s[1]}" y="${s[2]}" width="${s[3]}" height="${s[4]}" rx="${s[5]}"/>`;
  return `<path${c}${t} d="${s[1]}"/>`;
}

export function muscleKey(name) {
  return ALIAS[String(name ?? "").trim().toLowerCase()] || null;
}

// SVG for one muscle card. Unknown muscle names get the whole figure, unhighlighted.
export function muscleSvg(name) {
  const key = muscleKey(name);
  const target = key ? MUSCLES[key] : null;
  const view = target ? target.view : "front";
  let out = `<g class="sil">${SILHOUETTE.map((s) => shape(s)).join("")}</g><g class="mus">`;
  for (const [k, m] of Object.entries(MUSCLES)) {
    if (m.view !== view) continue;
    const cls = k === key ? "hl" : "";
    for (const s of m.shapes) {
      out += shape(s, cls, false);
      if (m.pair) out += shape(s, cls, true);
    }
  }
  out += "</g>";
  const vb = target
    ? `${Math.min(100, Math.max(-10, target.focus[0] - 55))} ${Math.min(290, Math.max(-10, target.focus[1] - 70))} 110 140`
    : "0 0 200 420";
  return `<svg class="body" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${out}</svg>`;
}
