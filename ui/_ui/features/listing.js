// The main listing: picks a view, renders it, and handles clicks and selection.
import { $, $$, esc, icon } from "../core/dom.js";
import { state, on, emit, items, itemPath, can } from "../core/state.js";
import { openMenu } from "../ui/menu.js";
import { openItem, clickItem, itemMenu, setActive } from "./actions.js";
import { openUsage } from "./usage.js";
import { renderList } from "../views/list.js";
import { renderGrid } from "../views/grid.js";

// To add a view: write views/<name>.js, register it here, and add a .seg-btn
// with data-view="<name>" to index.html.
const VIEWS = { list: renderList, grid: renderGrid };

const listing = () => $("#listing");

function skeleton() {
  return `<div class="table skeleton"><div class="row head"><span></span><span>Name</span></div>` +
    Array.from({ length: 6 }, () => `<div class="row"><span></span><span class="name"></span></div>`).join("") + `</div>`;
}

function emptyState(title, text, ic = "empty") {
  return `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

function render() {
  const el = listing();
  if (state.loadError) {
    el.innerHTML = emptyState("Can't open this folder", state.loadError);
    return;
  }
  const list = items();
  if (!VIEWS[state.view]) state.view = "list";
  $$(".seg-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));

  if (!list.length) {
    el.innerHTML = state.hits
      ? emptyState("No results", `Nothing matches “${state.query}”.`, "search")
      : emptyState("This folder is empty", can("write") ? "Drop files anywhere, or use Upload." : "Nothing here yet.");
    updateSel();
    return;
  }

  const head = state.hits
    ? `<p class="section-label">${list.length}${state.hitsTrunc ? "+" : ""} result${list.length === 1 ? "" : "s"}</p>`
    : "";
  el.innerHTML = head + VIEWS[state.view](list, { sort: state.sort, pathOf: itemPath, bars: !state.hits });
  updateSel();
}

function updateSel() {
  const list = items();
  const active = state.paneOpen && state.active?.path;
  $$("#listing [data-i]").forEach((el) => {
    const path = itemPath(list[+el.dataset.i]);
    el.classList.toggle("sel", state.sel.has(path));
    el.classList.toggle("active", path === active);
  });
  listing().classList.toggle("has-sel", state.sel.size > 0);
  $("#selbar").hidden = !state.sel.size;
  $("#sel-count").textContent = `${state.sel.size} selected`;
}

function onClick(e) {
  const sortBtn = e.target.closest("[data-sort]");
  if (sortBtn) {
    const k = sortBtn.dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
    localStorage.setItem("sort", JSON.stringify(state.sort));
    return render();
  }
  const el = e.target.closest("[data-i]");
  if (!el) return;
  const i = +el.dataset.i;
  const it = items()[i];
  const path = itemPath(it);

  if (e.target.closest("[data-usage]")) {
    e.preventDefault();
    return openUsage(path);
  }
  if (e.target.closest("[data-more]")) {
    e.preventDefault();
    e.stopPropagation();
    return openMenu(e.target.closest("[data-more]"), itemMenu(it));
  }
  // With a selection active, a click anywhere but the name toggles selection.
  if (e.target.closest("[data-check]") || e.ctrlKey || e.metaKey || e.shiftKey || (state.sel.size && !e.target.closest("[data-open]"))) {
    e.preventDefault();
    if (e.shiftKey && state.lastSel != null) {
      const [a, b] = [state.lastSel, i].sort((x, y) => x - y);
      items().slice(a, b + 1).forEach((x) => state.sel.add(itemPath(x)));
    } else {
      state.sel.has(path) ? state.sel.delete(path) : state.sel.add(path);
    }
    state.lastSel = i;
    return emit("selection");
  }
  e.preventDefault();
  if (e.detail > 1) return; // the second click of a double-click: see onDblClick
  clickItem(it);
}

// With the preview pane showing, a single click previews a file and a double-click opens it.
function onDblClick(e) {
  const el = e.target.closest("[data-i]");
  if (!el || !state.paneOpen || state.sel.size || e.target.closest("[data-check], [data-more], [data-usage]")) return;
  const it = items()[+el.dataset.i];
  if (!it.dir) openItem(it);
}

// Move the preview to the next (n = 1) or previous (n = -1) item in the listing.
export function stepActive(n) {
  const list = items();
  if (!list.length) return;
  const i = state.active ? list.findIndex((x) => itemPath(x) === state.active.path) : -1;
  const j = i < 0 ? (n > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, i + n));
  setActive(list[j], list, { scroll: true });
}

function onActive(opts) {
  updateSel();
  if (opts?.scroll) $("#listing .active")?.scrollIntoView({ block: "nearest" });
}

export function selectAll() {
  items().forEach((x) => state.sel.add(itemPath(x)));
  emit("selection");
}

export function initListing() {
  on("loading", () => { if (!listing().children.length) listing().innerHTML = skeleton(); });
  on("render", render);
  on("selection", updateSel);
  on("active", onActive);
  listing().addEventListener("click", onClick);
  listing().addEventListener("dblclick", onDblClick);

  $$(".seg-btn").forEach((b) => (b.onclick = () => {
    state.view = b.dataset.view;
    localStorage.setItem("view", state.view);
    render();
  }));

  // Thumbnails sit over the file-type icon; drop any that fail so the icon shows.
  // (A listener rather than inline onerror, so the CSP can forbid inline script.)
  document.addEventListener("error", (e) => {
    if (e.target.matches?.("img[data-thumb]")) e.target.remove();
  }, true);
}
