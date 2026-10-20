import { $ } from "../core/dom.js";
import { search } from "../core/api.js";
import { state, emit } from "../core/state.js";
import { toast } from "../ui/toast.js";

let timer = 0;

export async function runSearch(q) {
  state.query = q;
  try {
    const { hits, truncated } = await search(q);
    if (state.query !== q) return; // a newer search started
    state.hits = hits;
    state.hitsTrunc = truncated;
    state.sel.clear();
    emit("render");
  } catch (err) {
    toast("Search failed: " + err.message, "err");
  }
}

export function clearSearch(rerender = true) {
  if (!state.hits && !state.query) return;
  state.hits = null;
  state.query = "";
  $("#search").value = "";
  if (rerender) emit("render");
}

export function initSearch() {
  $("#search").addEventListener("input", (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (!q) return clearSearch();
    timer = setTimeout(() => runSearch(q), 250);
  });
}
