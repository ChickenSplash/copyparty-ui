export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Icons are <symbol>s in the sprite at the bottom of index.html.
export const icon = (id, cls = "i") => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
