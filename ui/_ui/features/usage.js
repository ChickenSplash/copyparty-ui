// The storage usage modal: a sunburst of the whole file store, opened on the
// folder it was opened from. Click a slice to zoom into it, the middle to zoom
// out; double-click a folder to open it.
import { $, $$, esc, icon } from "../core/dom.js";
import { fmtSize, plural } from "../core/format.js";
import { state, on } from "../core/state.js";
import { getUsage, findNode, lineage } from "../core/usage.js";
import { layout, sunburstSvg } from "../views/sunburst.js";
import { navigate } from "./nav.js";

let data = null; // { root, source, at } from getUsage()
let focus = null; // the folder in the middle
let arcs = [];
let wantPath = "/";
let seq = 0;

const dlg = () => $("#usage");
const nameOf = (node) => node.name || "Home";
const short = (s, n = 15) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function pct(part, whole) {
  if (!whole) return "";
  const p = (part / whole) * 100;
  return (p >= 10 ? Math.round(p) : p >= 0.1 ? p.toFixed(1) : "<0.1") + "%";
}

function arcLabel(a) {
  if (a.kind === "dir") return nameOf(a.node);
  if (a.kind === "files") return `Files in ${nameOf(a.parent)}`;
  return `${plural(a.n, "smaller folder")}`;
}

/* ---------- drawing ---------- */

function centerLines(a) {
  if (a) return [short(arcLabel(a)), fmtSize(a.sz), `${pct(a.sz, focus.sz)} of ${short(nameOf(focus), 9)}`];
  return [short(nameOf(focus)), fmtSize(focus.sz), focus.parent ? `${pct(focus.sz, data.root.sz)} of all` : plural(focus.n, "file")];
}

function crumbsHtml() {
  return lineage(focus).map((n, i, all) =>
    (i ? `<span class="sep">/</span>` : "") +
    `<button data-zoom="${i}"${i === all.length - 1 ? ` aria-current="true"` : ""}>${esc(nameOf(n))}</button>`).join("");
}

// What the folder holds, as the innermost ring draws it.
function contentsHtml() {
  const ring = arcs.filter((a) => a.d === 1);
  if (!ring.length) return `<p class="pv-hint">Nothing inside to measure.</p>`;
  const max = Math.max(...ring.map((a) => a.sz));
  return `<p class="section-label">Inside ${esc(nameOf(focus))}</p><ul class="pv-list us-list">` + ring.map((a) => {
    const sw = a.kind === "dir" ? `h${a.hue} d1` : a.kind;
    const tip = a.kind === "dir" ? `${plural(a.node.n, "file")} · double-click to open` : a.kind === "other" ? a.nodes.map(nameOf).join(", ") : "";
    return `<li><button data-k="${a.k}"${tip ? ` title="${esc(tip)}"` : ""}>` +
      `<span class="sw ${sw}"></span><span class="n">${esc(arcLabel(a))}</span>` +
      `<span class="s">${fmtSize(a.sz)} · ${pct(a.sz, focus.sz)}</span>` +
      `<meter class="szbar dir" min="0" max="1" value="${Math.max(a.sz / max, 0.04)}" aria-hidden="true"></meter></button></li>`;
  }).join("") + `</ul>`;
}

function footHtml() {
  const when = new Date(data.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const note = data.source === "index"
    ? "From copyparty's index. Backups are counted after its hourly rescan."
    : "Measured by listing every folder, so hidden folders aren't counted.";
  return `<span>${note} Updated ${when}.</span><button class="btn ghost sm" data-act="refresh">Refresh</button>`;
}

function render() {
  arcs = layout(focus);
  $("#usage-crumbs").innerHTML = crumbsHtml();
  $("#usage-chart").innerHTML = sunburstSvg(focus, arcs, centerLines(null));
  $("#usage-side").innerHTML = contentsHtml();
  $("#usage-foot").innerHTML = footHtml();
}

function setHover(k) {
  const a = k == null ? null : arcs[k];
  $$("#usage [data-k]").forEach((el) => el.classList.toggle("hover", a != null && +el.dataset.k === a.k));
  $$("#usage-chart text").forEach((t, i) => (t.textContent = centerLines(a)[i]));
}

function message(title, text) {
  $("#usage-chart").innerHTML = `<div class="empty">${icon("usage")}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  $("#usage-side").innerHTML = $("#usage-foot").innerHTML = $("#usage-crumbs").innerHTML = "";
}

/* ---------- opening, zooming ---------- */

async function load(fresh = false) {
  const n = ++seq;
  if (!data || fresh) message("Measuring…", "Adding up folder sizes.");
  try {
    const d = await getUsage({ fresh });
    if (n !== seq) return;
    data = d;
  } catch (err) {
    if (n === seq) message("Couldn't measure folders", err.message);
    return;
  }
  focus = findNode(data.root, wantPath) || data.root;
  if (!data.root.sz) return message("Nothing stored yet", "Upload something and it shows up here.");
  render();
}

// Open the usage view on the folder at `path`.
export function openUsage(path = "/") {
  wantPath = path;
  if (!dlg().open) dlg().showModal();
  load();
}

export const isUsageOpen = () => dlg().open;

function zoom(node) {
  if (!node || node === focus) return;
  focus = node;
  render();
}

function onClick(e) {
  if (e.target === dlg()) return dlg().close(); // the backdrop
  if (e.detail > 1) return; // see onDblClick
  const t = e.target.closest("[data-k], [data-core], [data-zoom], [data-act]");
  if (!t) return;
  if (t.dataset.zoom != null) return zoom(lineage(focus)[+t.dataset.zoom]);
  if (t.hasAttribute("data-core")) return zoom(focus.parent);
  const act = t.dataset.act;
  if (act === "refresh") return load(true);
  const a = arcs[+t.dataset.k];
  if (!a) return;
  // A folder zooms in; "other" and "files" zoom to the folder they belong to.
  zoom(a.kind === "dir" ? a.node : a.parent);
}

function onDblClick(e) {
  const a = arcs[+e.target.closest("[data-k]")?.dataset.k];
  if (a?.kind !== "dir") return;
  dlg().close();
  navigate(a.node.path);
}

function onOver(e) {
  const el = e.target.closest("[data-k]");
  setHover(el ? +el.dataset.k : null);
}

export function initUsage() {
  const d = dlg();
  d.addEventListener("click", onClick);
  d.addEventListener("dblclick", onDblClick);
  d.addEventListener("pointerover", onOver);
  d.addEventListener("focusin", onOver);
  $("#usage-chart").addEventListener("pointerleave", () => setHover(null));
  $("#usage-close").onclick = () => d.close();
  $("#storage").onclick = () => openUsage(state.cwd);
  d.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && focus?.parent) {
      e.preventDefault();
      zoom(focus.parent);
    }
  });
  d.addEventListener("close", () => { seq++; });
  // A change (upload, delete, rename) makes the next open measure again.
  on("changed", () => { data = null; });
  on("unauthorized", () => {
    data = null;
    if (d.open) d.close();
  });
}
