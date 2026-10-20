// The file tree in the sidebar. Folders open one level at a time, loaded when
// first expanded. Clicking a folder opens it in the main view, clicking a file
// opens it; the chevron only expands. Follows the current folder: its parents
// expand and it stays highlighted.
import { $, $$, esc, icon } from "../core/dom.js";
import { fileUrl } from "../core/api.js";
import { getDir } from "../core/cache.js";
import { kindOf, ICON } from "../core/kinds.js";
import { parentOf } from "../core/paths.js";
import { state, on } from "../core/state.js";
import { openMenu } from "../ui/menu.js";
import { navigate } from "./nav.js";
import { openItem, clickItem, itemMenu } from "./actions.js";

const ROOT = "/";
const meta = new Map(); // path -> item, as in a listing plus its full `path`
const kids = new Map(); // folder path -> [child paths], or "error"
const loading = new Set();
const expanded = new Set(JSON.parse(localStorage.getItem("tree-open") || "[]"));
let visible = []; // paths of the rows on screen, in order (keyboard moves through these)
let focusPath = null; // the row Tab lands on
let reveal = false; // scroll the current folder into view once it's drawn
let queued = false;

const tree = () => $("#tree");
const saveExpanded = () => localStorage.setItem("tree-open", JSON.stringify([...expanded].slice(-200)));
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const siblings = (it) => (kids.get(parentOf(it.path)) || []).map((p) => meta.get(p));

/* ---------- data ---------- */

function setChildren(dir, d) {
  const list = [...[...d.dirs].sort(byName), ...[...d.files].sort(byName)];
  const paths = list.map((x) => {
    const it = { ...x, path: dir + x.href };
    meta.set(it.path, it);
    return it.path;
  });
  kids.set(dir, paths);
  // Forget expanded subfolders that are gone (renamed or deleted).
  for (const p of expanded) if (p !== dir && parentOf(p) === dir && !paths.includes(p)) expanded.delete(p);
}

async function load(dir, fresh = false) {
  if (loading.has(dir)) return;
  loading.add(dir);
  try {
    setChildren(dir, await getDir(dir, { fresh }));
  } catch (err) {
    kids.set(dir, "error");
    if (err.status === 404) { expanded.delete(dir); saveExpanded(); }
  } finally {
    loading.delete(dir);
    schedule();
  }
}

function toggle(path, open = !expanded.has(path)) {
  open ? expanded.add(path) : expanded.delete(path);
  saveExpanded();
  schedule();
}

/* ---------- drawing ---------- */

function schedule() {
  if (queued) return;
  queued = true;
  queueMicrotask(render);
}

// The rows on screen: { it, level, isOpen } or a { note } placeholder.
function rows() {
  const out = [];
  const walk = (dir, level) => {
    const k = kids.get(dir);
    if (!Array.isArray(k)) {
      if (k !== "error") load(dir);
      out.push({ level, note: k === "error" ? "Couldn't load" : "Loading…", loading: k !== "error" });
      return;
    }
    if (!k.length && dir !== ROOT) out.push({ level, note: "Empty" });
    for (const p of k) {
      const it = meta.get(p);
      const isOpen = it.dir && expanded.has(p);
      out.push({ it, level, isOpen });
      if (isOpen) walk(p, level + 1);
    }
  };
  walk(ROOT, 1);
  return out;
}

const guides = (level) => `<span class="tguide"></span>`.repeat(level - 1);

function rowHtml({ it, level, isOpen }) {
  const k = kindOf(it.name, it.dir);
  const cur = it.dir && it.path === state.cwd;
  const active = state.paneOpen && it.path === state.active?.path;
  const attrs = `role="treeitem" aria-level="${level}"` +
    (it.dir ? ` aria-expanded="${isOpen}"` : "") + (cur ? ` aria-current="page"` : "") +
    ` tabindex="${it.path === focusPath ? 0 : -1}" data-path="${esc(it.path)}"` +
    ` href="${esc(it.dir ? it.path : fileUrl(it.path))}"`;
  return `<a class="tnode${it.dir ? " dir" : ""}${cur ? " current" : ""}${active ? " active" : ""}" ${attrs}>${guides(level)}` +
    `<span class="tchev"${it.dir ? " data-toggle" : ""}>${it.dir ? icon("chev-right") : ""}</span>` +
    `<span class="tic k-${k}">${icon(isOpen ? "folder-open" : ICON[k])}</span>` +
    `<span class="tname" title="${esc(it.name)}">${esc(it.name)}</span>` +
    `<span class="tmore" data-more title="More">${icon("dots")}</span></a>`;
}

const noteHtml = ({ level, note, loading }) =>
  `<div class="tnode note${loading ? " loading" : ""}" role="none">${guides(level)}<span class="tchev"></span><span class="tname">${note}</span></div>`;

function render() {
  queued = false;
  const t = tree();
  const list = rows();
  visible = list.filter((r) => r.it).map((r) => r.it.path);
  if (!visible.includes(focusPath)) focusPath = visible.includes(state.cwd) ? state.cwd : visible[0] ?? null;

  const hadFocus = t.contains(document.activeElement);
  t.innerHTML = list.map((r) => (r.it ? rowHtml(r) : noteHtml(r))).join("");
  if (hadFocus) focusRow(focusPath);
  $("#tree-home").classList.toggle("current", state.cwd === ROOT);

  if (reveal) {
    const cur = $(".tnode.current", t);
    if (cur || state.cwd === ROOT) reveal = false;
    if (cur && (cur.offsetTop < t.scrollTop || cur.offsetTop + cur.offsetHeight > t.scrollTop + t.clientHeight))
      t.scrollTop = cur.offsetTop - t.clientHeight / 3;
  }
}

const rowOf = (path) => $$(".tnode[data-path]", tree()).find((el) => el.dataset.path === path);

function focusRow(path) {
  const el = path && rowOf(path);
  if (!el) return;
  $$(".tnode[tabindex='0']", tree()).forEach((x) => (x.tabIndex = -1));
  el.tabIndex = 0;
  focusPath = path;
  el.focus({ preventScroll: false });
}

/* ---------- interaction ---------- */

// open: Enter, which opens a file; a click only previews it when the pane is showing.
function activate(it, open = false) {
  if (!it.dir) return open ? openItem(it, siblings(it)) : clickItem(it, siblings(it));
  if (it.path === state.cwd) return toggle(it.path);
  toggle(it.path, true);
  navigate(it.path);
}

function onClick(e) {
  const row = e.target.closest(".tnode[data-path]");
  if (!row) return;
  const it = meta.get(row.dataset.path);
  const more = e.target.closest("[data-more]");
  if (more) {
    e.preventDefault();
    e.stopPropagation();
    return openMenu(more, itemMenu(it, siblings(it)));
  }
  if (e.ctrlKey || e.metaKey || e.shiftKey) return; // let the browser open it in a new tab
  e.preventDefault();
  if (e.detail > 1) return; // see onDblClick
  focusPath = it.path;
  if (e.target.closest("[data-toggle]")) toggle(it.path);
  else activate(it);
}

function onDblClick(e) {
  const row = e.target.closest(".tnode[data-path]");
  const it = row && meta.get(row.dataset.path);
  if (it && !it.dir && state.paneOpen && !e.target.closest("[data-more]")) openItem(it, siblings(it));
}

function onContextMenu(e) {
  const row = e.target.closest(".tnode[data-path]");
  if (!row) return;
  e.preventDefault();
  const it = meta.get(row.dataset.path);
  openMenu(row, itemMenu(it, siblings(it)));
}

// Arrow keys as in a file manager's tree: up/down move, right expands or steps
// into a folder, left collapses or steps out to the parent.
function onKey(e) {
  const row = e.target.closest(".tnode[data-path]");
  if (!row || e.altKey || e.ctrlKey || e.metaKey) return;
  const path = row.dataset.path;
  const it = meta.get(path);
  const i = visible.indexOf(path);
  const isOpen = it.dir && expanded.has(path);
  let to = null;
  switch (e.key) {
    case "ArrowDown": to = visible[i + 1]; break;
    case "ArrowUp": to = visible[i - 1]; break;
    case "Home": to = visible[0]; break;
    case "End": to = visible[visible.length - 1]; break;
    case "ArrowRight":
      if (it.dir && !isOpen) toggle(path, true);
      else if (isOpen && parentOf(visible[i + 1] || "") === path) to = visible[i + 1];
      break;
    case "ArrowLeft":
      if (isOpen) toggle(path, false);
      else if (parentOf(path) !== ROOT) to = parentOf(path);
      break;
    case "Enter": activate(it, true); break;
    case " ": it.dir ? toggle(path) : activate(it); break;
    default: return;
  }
  e.preventDefault();
  e.stopPropagation();
  focusPath = to || path;
  if (to) focusRow(to);
}

// d is the folder's listing, or undefined when it failed to load.
function onDir(d) {
  // Retry anything that failed earlier (signed out, offline).
  for (const [p, k] of kids) if (k === "error") kids.delete(p);
  if (d) setChildren(state.cwd, d);
  for (let p = parentOf(state.cwd); p !== ROOT; p = parentOf(p)) expanded.add(p);
  saveExpanded();
  if (!tree().contains(document.activeElement)) focusPath = state.cwd;
  reveal = true;
  schedule();
}

// Reload the folders that changed. The current one reloads through the main
// listing ("dir"), unless search results are showing instead.
function onChanged(paths = []) {
  for (const p of paths) if (kids.has(p) && (p !== state.cwd || state.hits)) load(p, true);
}

export function initTree() {
  const t = tree();
  t.addEventListener("click", onClick);
  t.addEventListener("dblclick", onDblClick);
  t.addEventListener("contextmenu", onContextMenu);
  t.addEventListener("keydown", onKey);
  $("#tree-collapse").onclick = () => {
    expanded.clear();
    saveExpanded();
    schedule();
  };
  on("dir", onDir);
  on("changed", onChanged);
  on("active", schedule);
  on("unauthorized", () => {
    meta.clear();
    kids.clear();
    t.innerHTML = "";
  });
}
