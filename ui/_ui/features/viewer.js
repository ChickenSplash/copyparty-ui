// Full-screen viewer, stepping through the files of the current listing.
import { $, esc, icon } from "../core/dom.js";
import { fileUrl, readText } from "../core/api.js";
import { fmtSize, fmtDate } from "../core/format.js";
import { kindOf, ICON } from "../core/kinds.js";
import { itemPath } from "../core/state.js";

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

async function show() {
  const it = list[idx];
  const url = fileUrl(itemPath(it));
  const k = kindOf(it.name, false);
  $("#viewer-name").textContent = it.name;
  $("#viewer-meta").textContent = `${fmtSize(it.sz)} · ${fmtDate(it.ts)}` + (list.length > 1 ? ` · ${idx + 1} of ${list.length}` : "");
  $("#viewer-dl").href = url + "?dl";
  $("#viewer-prev").hidden = $("#viewer-next").hidden = list.length < 2;
  const body = $("#viewer-body");
  if (k === "image") body.innerHTML = `<img src="${esc(url)}" alt="">`;
  else if (k === "video") body.innerHTML = `<video src="${esc(url)}" controls autoplay playsinline></video>`;
  else if (k === "audio") body.innerHTML = `<audio src="${esc(url)}" controls autoplay></audio>`;
  else if (k === "pdf") body.innerHTML = `<iframe src="${esc(url)}"></iframe>`;
  else if ((k === "text" || k === "code") && it.sz < 2e6) {
    body.innerHTML = `<pre></pre>`;
    try {
      const t = await readText(itemPath(it));
      if (list[idx] === it) $("pre", body).textContent = t;
    } catch (err) {
      $("pre", body).textContent = err.message;
    }
  } else {
    body.innerHTML = `<div class="nopreview"><div class="ficon">${icon(ICON[k])}</div><p>No preview for this file</p>` +
      `<p><a class="btn primary" href="${esc(url)}?dl">${icon("download")}<span>Download</span></a></p></div>`;
  }
}

export function initViewer() {
  $("#viewer-close").onclick = closeViewer;
  $("#viewer-prev").onclick = () => stepViewer(-1);
  $("#viewer-next").onclick = () => stepViewer(1);
  $("#viewer-body").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeViewer(); });
}
