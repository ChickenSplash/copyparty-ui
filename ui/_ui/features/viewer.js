// Full-screen viewer, stepping through the files of the current listing.
import { $ } from "../core/dom.js";
import { fileUrl } from "../core/api.js";
import { fmtSize, fmtDate } from "../core/format.js";
import { itemPath } from "../core/state.js";
import { previewHtml, loadText } from "../views/preview.js";

let list = [];
let idx = 0;

export function openViewer(it, files) {
  list = files;
  idx = Math.max(0, list.indexOf(it));
  $("#viewer").hidden = false;
  document.body.style.overflow = "hidden";
  show();
}

export function closeViewer() {
  $("#viewer").hidden = true;
  $("#viewer-body").innerHTML = "";
  document.body.style.overflow = "";
}

export function stepViewer(n) {
  if (list.length < 2) return;
  idx = (idx + n + list.length) % list.length;
  show();
}

export const isViewerOpen = () => !$("#viewer").hidden;

function show() {
  const it = list[idx];
  const path = itemPath(it);
  const url = fileUrl(path);
  $("#viewer-name").textContent = it.name;
  $("#viewer-meta").textContent = `${fmtSize(it.sz)} · ${fmtDate(it.ts)}` + (list.length > 1 ? ` · ${idx + 1} of ${list.length}` : "");
  $("#viewer-dl").href = url + "?dl";
  $("#viewer-prev").hidden = $("#viewer-next").hidden = list.length < 2;
  const body = $("#viewer-body");
  body.innerHTML = previewHtml(it, path, { full: true });
  loadText(body, it, path, { full: true, isCurrent: () => list[idx] === it });
}

export function initViewer() {
  $("#viewer-close").onclick = closeViewer;
  $("#viewer-prev").onclick = () => stepViewer(-1);
  $("#viewer-next").onclick = () => stepViewer(1);
  $("#viewer-body").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeViewer(); });
}
