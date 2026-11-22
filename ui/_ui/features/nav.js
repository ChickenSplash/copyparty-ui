// Which folder is open, loading it, and the browser history.
import { $ } from "../core/dom.js";
import { signedIn } from "../core/api.js";
import { getDir } from "../core/cache.js";
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
    d = await getDir(state.cwd, { fresh: true });
  } catch (err) {
    if (seq !== loadSeq) return;
    // A 403 also means a signed-in account opened a folder it has no access to.
    if ((err.status === 403 || err.status === 401) && !(await signedIn())) return emit("unauthorized");
    if (seq !== loadSeq) return;
    state.loadError = err.status === 404 ? "It may have been moved or deleted."
      : err.status === 403 ? "Your account doesn't have access to it." : err.message;
    state.perms = [];
    $("#app").hidden = false;
    emit("dir");
    emit("render");
    return;
  }
  if (seq !== loadSeq) return;
  if (d.acct === "*" && !d.perms.length) return emit("unauthorized");
  // An account that can only use one folder (like /Shared) goes straight there.
  if (state.cwd === "/" && !d.perms.length && d.dirs.length === 1 && !d.files.length) {
    state.cwd = "/" + d.dirs[0].href;
    history.replaceState(null, "", state.cwd);
    return load();
  }

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
