// The main listing: picks a view, renders it, and handles clicks and selection.
import { $, $$, esc, icon } from "../core/dom.js";
import { state, on, emit, items, itemPath, can } from "../core/state.js";
import { openMenu } from "../ui/menu.js";
import { openItem, itemMenu } from "./actions.js";
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
  el.innerHTML = head + VIEWS[state.view](list, { sort: state.sort, pathOf: itemPath });
  updateSel();
}

function updateSel() {
  const list = items();
  $$("#listing [data-i]").forEach((el) => el.classList.toggle("sel", state.sel.has(itemPath(list[+el.dataset.i]))));
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
  openItem(it);
}

export function selectAll() {
  items().forEach((x) => state.sel.add(itemPath(x)));
  emit("selection");
}

export function initListing() {
  on("loading", () => { if (!listing().children.length) listing().innerHTML = skeleton(); });
  on("render", render);
  on("selection", updateSel);
  listing().addEventListener("click", onClick);

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
