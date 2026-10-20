// Which folder is open, loading it, and the browser history.
import { $ } from "../core/dom.js";
import { listDir } from "../core/api.js";
import { state, emit, on } from "../core/state.js";
import { clearSearch, runSearch } from "./search.js";

let loadSeq = 0;

export async function navigate(path, push = true) {
  if (!path.endsWith("/")) path += "/";
  if (push && path !== state.cwd) history.pushState(null, "", path);
  state.cwd = path;
  state.sel.clear();
  clearSearch(false);
  await load();
}

export async function load() {
  const seq = ++loadSeq;
  emit("loading");
  let d;
  try {
    d = await listDir(state.cwd);
  } catch (err) {
    if (seq !== loadSeq) return;
    if (err.status === 403 || err.status === 401) return emit("unauthorized");
    state.loadError = err.status === 404 ? "It may have been moved or deleted." : err.message;
    $("#app").hidden = false;
    emit("dir");
    emit("render");
    return;
  }
  if (seq !== loadSeq) return;
  if (d.acct === "*" && !d.perms.length) return emit("unauthorized");

  Object.assign(state, { dirs: d.dirs, files: d.files, perms: d.perms, acct: d.acct, loadError: null });
  $("#app").hidden = false;
  emit("dir", d);
  emit("render");
}

// Reload whatever is showing: the search results, or the folder.
export function refresh() {
  if (state.hits) runSearch(state.query);
  else load();
}

export function initNav() {
  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigate(nav.dataset.nav);
    }
  });

  window.addEventListener("popstate", () => {
    state.cwd = location.pathname.endsWith("/") ? location.pathname : location.pathname + "/";
    state.sel.clear();
    clearSearch(false);
    load();
  });

  on("changed", refresh);
}
