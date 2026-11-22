// The usage sunburst: pure data in, SVG markup out (no DOM, no state).
//
// The folder in the middle is the focus; each ring out is one level deeper,
// and each slice's angle is its share of the focus's size. Slices are coloured
// by the top-level folder they sit in (hue classes h0..h7), lighter further out
// (d1..d5), so the colours come from CSS and follow the theme. A folder that
// fills more than half the circle hands its subfolders hues of their own, or
// one big folder (Backups, say) would paint the whole chart one colour.
//
// Arcs: { k, kind, node, parent, sz, n?, a0, a1, d, hue }
//   kind   "dir" a folder (node), "files" the files directly in `parent`,
//          "other" several folders too thin to draw (n of them)
//   a0,a1  angles in radians, clockwise from 12 o'clock
//   d      ring, 1 being the innermost
import { esc } from "../core/dom.js";

export const R = 200; // outer radius, in viewBox units
export const CORE = 54; // radius of the middle
export const RINGS = 5;
const HUES = 8;
const MIN_ANGLE = 0.012; // about 0.7°: thinner folders merge into "other"
const PAD = 0.0035; // gap between neighbouring slices, in radians

// Every arc to draw around `focus`.
export function layout(focus) {
  const arcs = [];
  const add = (a) => arcs.push({ k: arcs.length, ...a });
  const walk = (node, a0, a1, d, hue, split) => {
    if (d > RINGS || !node.sz) return;
    const scale = (a1 - a0) / node.sz;
    let a = a0;
    const small = [];
    node.dirs.forEach((c, i) => {
      const w = c.sz * scale;
      if (w < MIN_ANGLE) return small.push(c);
      const h = split ? (hue + i) % HUES : hue;
      add({ kind: "dir", node: c, parent: node, sz: c.sz, a0: a, a1: a + w, d, hue: h });
      walk(c, a, a + w, d + 1, h, w > Math.PI);
      a += w;
    });
    const rest = small.reduce((s, c) => s + c.sz, 0);
    if (rest * scale >= MIN_ANGLE / 2) {
      add({ kind: "other", nodes: small, n: small.length, parent: node, sz: rest, a0: a, a1: a + rest * scale, d, hue });
      a += rest * scale;
    }
    if (node.own * scale >= MIN_ANGLE / 2) add({ kind: "files", parent: node, sz: node.own, a0: a, a1: a + node.own * scale, d, hue });
  };
  walk(focus, 0, Math.PI * 2, 1, 0, true);
  return arcs;
}

const pt = (r, a) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
// Ring radii. The rings share out the space between the middle and the edge,
// so a shallow folder still fills the chart (but no ring is wider than a third).
const ringIn = (d, rings) => CORE + ((R - CORE) / rings) * (d - 1) + 1.5;
const ringOut = (d, rings) => CORE + ((R - CORE) / rings) * d - 0.5;

// An annular sector. A full ring is drawn as two halves, since an SVG arc
// can't start and end at the same point.
function sector(a0, a1, r0, r1) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    return `M${pt(r1, 0)}A${r1} ${r1} 0 1 1 ${pt(r1, Math.PI)}A${r1} ${r1} 0 1 1 ${pt(r1, 0)}` +
      `M${pt(r0, 0)}A${r0} ${r0} 0 1 0 ${pt(r0, Math.PI)}A${r0} ${r0} 0 1 0 ${pt(r0, 0)}Z`;
  }
  const pad = Math.min(PAD, (a1 - a0) / 4);
  const b0 = a0 + pad, b1 = a1 - pad, big = b1 - b0 > Math.PI ? 1 : 0;
  return `M${pt(r1, b0)}A${r1} ${r1} 0 ${big} 1 ${pt(r1, b1)}L${pt(r0, b1)}A${r0} ${r0} 0 ${big} 0 ${pt(r0, b0)}Z`;
}

// center: the three lines of text in the middle.
export function sunburstSvg(focus, arcs, center = []) {
  const rings = Math.max(3, ...arcs.map((a) => a.d));
  const paths = arcs.map((a) => {
    const cls = `arc ${a.kind === "dir" ? `h${a.hue} d${a.d}` : a.kind}`;
    return `<path class="${cls}" data-k="${a.k}" d="${sector(a.a0, a.a1, ringIn(a.d, rings), ringOut(a.d, rings))}"/>`;
  }).join("");

  const [l1 = "", l2 = "", l3 = ""] = center;
  return `<svg class="sunburst" viewBox="${-R - 4} ${-R - 4} ${2 * R + 8} ${2 * R + 8}" role="img" aria-label="Folder sizes">` +
    `<g class="arcs">${paths}</g>` +
    `<circle class="core${focus.parent ? " up" : ""}" r="${CORE - 2}" data-core/>` +
    `<text class="core-t" y="-10">${esc(l1)}</text><text class="core-s" y="10">${esc(l2)}</text><text class="core-p" y="27">${esc(l3)}</text>` +
    `</svg>`;
}
