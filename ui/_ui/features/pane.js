// The preview pane on the right. It shows, first match wins:
//   several selected items   a summary of the selection
//   one selected item        that item
//   the active item          the file you clicked (or moved to with the arrow keys)
//   otherwise                the current folder (or the search results): size and largest items
// Shown on wide screens; the toolbar button switches it off and on (remembered).
import { $, $$, esc, icon } from "../core/dom.js";
import { downloadUrl } from "../core/api.js";
import { dec, fmtSize, fmtDateLong, plural } from "../core/format.js";
import { kindOf, ICON, KIND_LABEL, extOf } from "../core/kinds.js";
import { parentOf } from "../core/paths.js";
import { state, on, emit, items, itemPath } from "../core/state.js";
import { openMenu } from "../ui/menu.js";
import { makeResizer } from "../ui/resizer.js";
import { previewHtml, loadText, isTextPreview } from "../views/preview.js";
import { openItem, itemMenu, copyLink, setActive } from "./actions.js";
import { openUsage } from "./usage.js";

const wide = matchMedia("(min-width: 1100px)");
let wanted = localStorage.getItem("preview") !== "off";
let shown = null; // what the pane shows: { key, it?, path?, siblings?, list? }

const body = () => $("#pane-body");
const total = (list) => list.reduce((a, it) => a + (it.sz || 0), 0);
// copyparty's file count for a folder can lag behind its size after deletes; skip it then.
const countOf = (it) => (it.dir && it.n != null && !(it.n === 0 && it.sz > 0) ? plural(it.n, "item") : "");

function typeLabel(it) {
  if (it.dir) return "Folder";
  const ext = it.name.includes(".") ? extOf(it.name).toUpperCase() : "";
  return KIND_LABEL[kindOf(it.name, false)] + (ext ? ` · ${ext}` : "");
}

const details = (rows) =>
  `<dl class="pv-meta">${rows.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;

const folderLink = (dir) => `<a href="${esc(dir)}" data-nav="${esc(dir)}">${esc(dir === "/" ? "Home" : dec(dir.replace(/\/$/, "")))}</a>`;

// Biggest items first, each with a bar scaled to the biggest.
function largest(list, n = 6) {
  const top = list.filter((it) => it.sz > 0).sort((a, b) => b.sz - a.sz).slice(0, n);
  if (top.length < 2) return "";
  return `<p class="section-label">Largest</p><ul class="pv-list">` + top.map((it) => {
    const k = kindOf(it.name, it.dir);
    return `<li><button data-act="pick" data-i="${list.indexOf(it)}" title="${esc(it.name)}">` +
      `<span class="tic k-${k}">${icon(ICON[k])}</span><span class="n">${esc(it.name)}</span><span class="s">${fmtSize(it.sz)}</span>` +
      `<meter class="szbar${it.dir ? " dir" : ""}" min="0" max="1" value="${Math.max(it.sz / top[0].sz, 0.04)}" aria-hidden="true"></meter></button></li>`;
  }).join("") + `</ul>`;
}

/* ---------- what to show ---------- */

function subject() {
  const list = items();
  if (state.sel.size > 1) {
    const sel = list.filter((it) => state.sel.has(itemPath(it)));
    return { key: "s" + [...state.sel].join("\n"), html: () => selectionHtml(sel) };
  }
  const one = state.sel.size === 1 && list.find((it) => itemPath(it) === [...state.sel][0]);
  const pick = one ? { it: one, path: itemPath(one), siblings: list } : state.active;
  if (pick) return { ...pick, key: `i${pick.path}\n${pick.it.sz}\n${pick.it.ts}`, html: () => itemHtml(pick) };
  return { key: `f${state.cwd}\n${state.hits ? state.query : ""}\n${list.length}\n${total(list)}`, list, html: () => folderHtml(list) };
}

function itemHtml({ it, path }) {
  const k = kindOf(it.name, it.dir);
  const text = !it.dir && isTextPreview(it);
  // Images and icons open the viewer when clicked; players keep their own clicks.
  const opens = it.dir || !["video", "audio"].includes(k);
  const media = text
    ? previewHtml(it, path)
    : `<div class="pv-media k-${k}"${opens ? ` data-act="open" title="${it.dir ? "Open folder" : "Open"}"` : ""}>${it.dir ? icon("folder") : previewHtml(it, path)}</div>`;
  return media +
    `<h2 class="pv-name">${esc(it.name)}</h2>` +
    `<p class="pv-sub">${esc([typeLabel(it), it.dir ? countOf(it) : fmtSize(it.sz)].filter(Boolean).join(" · "))}</p>` +
    `<div class="pv-actions">` +
      `<button class="btn primary" data-act="open">${icon(it.dir ? "folder" : "eye")}<span>Open</span></button>` +
      `<a class="icon-btn" href="${esc(downloadUrl(path, it.dir))}" download title="${it.dir ? "Download as zip" : "Download"}">${icon("download")}</a>` +
      `<button class="icon-btn" data-act="link" title="Copy link">${icon("link")}</button>` +
      (it.dir ? `<button class="icon-btn" data-act="usage" title="Storage usage">${icon("usage")}</button>` : "") +
      `<button class="icon-btn" data-act="more" data-more title="More">${icon("dots")}</button>` +
    `</div>` +
    details([
      ["Size", it.dir && it.n == null ? "" : fmtSize(it.sz) + (countOf(it) ? ` · ${countOf(it)}` : "")],
      ["Modified", it.ts ? fmtDateLong(it.ts) : ""],
      ["Type", typeLabel(it)],
      ["Location", folderLink(parentOf(path))],
    ]);
}

function folderHtml(list) {
  const dirs = list.filter((it) => it.dir).length, files = list.length - dirs;
  const name = state.hits ? "Search results" : state.cwd === "/" ? "Home" : dec(state.cwd.split("/").filter(Boolean).pop());
  const counts = state.hits
    ? plural(list.length, "result") + (state.hitsTrunc ? "+" : "")
    : [dirs && plural(dirs, "folder"), files && plural(files, "file")].filter(Boolean).join(", ") || "Empty";
  return `<div class="pv-media pv-folder k-dir">${icon(state.hits ? "search" : "folder")}</div>` +
    `<h2 class="pv-name">${esc(name)}</h2><p class="pv-sub">${esc(counts)}</p>` +
    details([["Size", list.length ? fmtSize(total(list)) : ""]]) +
    (state.hits ? "" : `<button class="btn ghost sm pv-usage" data-act="usage">${icon("usage")}<span>Storage usage</span></button>`) +
    largest(list) +
    (list.some((it) => !it.dir) ? `<p class="pv-hint">Click a file to preview it here, double-click to open it. ↑ ↓ to step through.</p>` : "");
}

function selectionHtml(sel) {
  const dirs = sel.filter((it) => it.dir).length, files = sel.length - dirs;
  const names = sel.slice(0, 8).map((it) => {
    const k = kindOf(it.name, it.dir);
    return `<li><span class="tic k-${k}">${icon(ICON[k])}</span><span class="n">${esc(it.name)}</span><span class="s">${fmtSize(it.sz)}</span></li>`;
  }).join("");
  return `<div class="pv-media pv-folder">${icon("check")}</div>` +
    `<h2 class="pv-name">${sel.length} selected</h2>` +
    `<p class="pv-sub">${esc([dirs && plural(dirs, "folder"), files && plural(files, "file")].filter(Boolean).join(", "))}</p>` +
    details([["Size", fmtSize(total(sel))]]) +
    `<ul class="pv-list static">${names}</ul>` +
    (sel.length > 8 ? `<p class="pv-hint">and ${sel.length - 8} more</p>` : "");
}

/* ---------- drawing ---------- */

function render() {
  if (!state.paneOpen) return;
  const s = subject();
  if (shown?.key === s.key) return; // unchanged: don't restart a playing video
  shown = s;
  const b = body();
  b.innerHTML = s.html();
  b.scrollTop = 0;
  if (s.it && !s.it.dir) loadText(b, s.it, s.path, { isCurrent: () => shown === s });
}

function stopMedia() {
  $$("video, audio", body()).forEach((m) => m.pause());
}

async function onClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b || !shown) return;
  const act = b.dataset.act;
  if (act === "usage") return openUsage(shown.path || state.cwd);
  if (act === "open") {
    stopMedia();
    openItem(shown.it, shown.siblings);
  } else if (act === "link") copyLink(shown.path, shown.it.dir);
  else if (act === "more") {
    e.stopPropagation();
    openMenu(b, await itemMenu(shown.it, shown.siblings));
  } else if (act === "pick") {
    const it = shown.list[+b.dataset.i];
    it.dir ? openItem(it) : setActive(it, shown.list, { scroll: true });
  }
}

/* ---------- keeping the active item current ---------- */

// After a folder (re)loads: drop the active item if we've moved elsewhere, or
// swap in the fresh copy of it, if it still exists.
function onDir() {
  const a = state.active;
  if (a && a.cwd !== state.cwd) state.active = null;
  else if (a && parentOf(a.path) === state.cwd) {
    const list = items();
    const it = list.find((x) => itemPath(x) === a.path);
    state.active = it ? { ...a, it, siblings: list } : null;
  }
  shown = null;
}

// Files changed in a folder that won't reload through the main listing.
function onChanged(paths = []) {
  const a = state.active;
  if (!a) return;
  const dir = parentOf(a.path);
  if (paths.includes(dir) && (dir !== state.cwd || state.hits)) setActive(null);
}

function sync() {
  state.paneOpen = wanted && wide.matches;
  $("#app").classList.toggle("preview-off", !wanted);
  $("#preview-btn").setAttribute("aria-pressed", wanted);
  if (!state.paneOpen) {
    stopMedia();
    body().innerHTML = "";
    shown = null;
  }
  emit("active"); // the listing and tree only highlight the active item while the pane shows
}

export function initPane() {
  $("#preview-btn").onclick = () => {
    wanted = !wanted;
    localStorage.setItem("preview", wanted ? "on" : "off");
    sync();
  };
  wide.addEventListener("change", sync);
  body().addEventListener("click", onClick);
  makeResizer($("#pane-resize"), { host: $("#app"), cssVar: "--pane-w", key: "pane-w", side: "right", min: 260, max: 560, def: 340 });

  on("dir", onDir);
  on("changed", onChanged);
  for (const ev of ["dir", "render", "selection", "active"]) on(ev, render);
  on("unauthorized", () => {
    state.active = null;
    shown = null;
    body().innerHTML = "";
  });
  sync();
}
