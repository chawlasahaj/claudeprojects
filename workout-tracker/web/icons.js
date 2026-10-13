// Inline SVG icons (24×24), drawn to sit with the MacroFactor-style UI.

const P = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke-width="2.2" stroke-linecap="round"/>',
  back: '<path d="M15 5l-7 7 7 7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke-width="2.2" stroke-linecap="round"/>',
  stopwatch:
    '<circle cx="12" cy="13.5" r="7.5" fill="currentColor" stroke="none"/><path d="M10 3.2h4" stroke-width="2.4" stroke-linecap="round"/><path d="M12 13.5V9.8" stroke="var(--bg)" stroke-width="2.2" stroke-linecap="round"/>',
  history:
    '<path d="M5 4h14M5 20h14M8 4v16M16 4v16M5 9h14M5 15h14" stroke-width="2" stroke-linecap="round"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  info: '<path d="M6 19V12M12 19V6M18 19v-9" stroke-width="2.8" stroke-linecap="round"/>',
  warm: '<circle cx="12" cy="6" r="2.6" fill="currentColor" stroke="none"/><path d="M7 20l3-6 3 2v4M10 14l1.5-4.5L16 12l2.5-1.5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  note: '<path d="M5 19l1-4L16 5l3 3L9 18z" stroke-width="2" stroke-linejoin="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-width="2" stroke-linecap="round"/>',
  swap: '<path d="M4 9h14l-3.5-3.5M20 15H6l3.5 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  more: '<circle cx="12" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="2" fill="currentColor" stroke="none"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  cloud: '<path d="M7 18a4 4 0 01-.5-7.97A5.5 5.5 0 0117 8.5a4.5 4.5 0 01.5 9.5z" stroke-width="2" stroke-linejoin="round"/>',
};

export function icon(name, size = 24) {
  return `<svg class="i i-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">${P[name] || ""}</svg>`;
}
