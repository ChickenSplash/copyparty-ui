// Breadcrumbs, page title, free space, and buttons that need a permission.
import { $, $$, esc } from "../core/dom.js";
import { dec } from "../core/format.js";
import { state, on, can } from "../core/state.js";

function renderCrumbs() {
  const parts = state.cwd.split("/").filter(Boolean);
  let acc = "/";
  let html = `<a href="/" data-nav="/" data-drop="/">Home</a>`;
  for (const p of parts) {
    acc += p + "/";
    html += `<span class="sep">/</span><a href="${esc(acc)}" data-nav="${esc(acc)}" data-drop="${esc(acc)}">${esc(dec(p))}</a>`;
  }
  $("#crumbs").innerHTML = html;
  $("#drop-dest").textContent = parts.length ? dec(parts[parts.length - 1]) : "Home";
  document.title = (parts.length ? dec(parts[parts.length - 1]) + " · " : "") + ($("#brand-name").textContent || "Files");
}

// d is the listing, or undefined when the folder failed to load.
function onDir(d) {
  if (d) {
    $("#storage").textContent = d.free ? `${d.free} free` : "";
    if (d.free) $("#storage").title = `${d.free} free of ${d.total}`;
    if (d.server) $("#brand-name").textContent = d.server;
    $$("[data-perm]").forEach((el) => (el.hidden = !can(el.dataset.perm)));
  }
  renderCrumbs();
}

export function initHeader() {
  on("dir", onDir);
}
