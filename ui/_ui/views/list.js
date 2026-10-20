import { esc, icon } from "../core/dom.js";
import { fileUrl } from "../core/api.js";
import { dec, fmtSize, fmtDate } from "../core/format.js";
import { kindOf, ICON, hasThumb, isImage } from "../core/kinds.js";
import { parentOf } from "../core/paths.js";
import { thumbImg, dropAttr } from "./common.js";

const pct = (part, whole) => {
  const p = (part / whole) * 100;
  return p >= 1 ? Math.round(p) + "%" : "<1%";
};

// Size cell: the size, plus a bar scaled to the biggest item when `max` is set.
function sizeCell(it, max, total) {
  // copyparty only reports a folder size when it has indexed the folder.
  const known = !it.dir || it.n != null;
  const tip = [];
  // The file count can lag behind the size after deletes; skip it when it contradicts.
  if (it.dir && known && !(it.n === 0 && it.sz > 0)) tip.push(`${it.n.toLocaleString("en-GB")} item${it.n === 1 ? "" : "s"}`);
  if (max && it.sz > 0) tip.push(pct(it.sz, total) + " of this folder");
  const bar = max && it.sz > 0
    ? `<meter class="szbar${it.dir ? " dir" : ""}" min="0" max="1" value="${Math.max(it.sz / max, 0.04)}" aria-hidden="true"></meter>`
    : "";
  return `<span class="num size"${tip.length ? ` title="${esc(tip.join(" · "))}"` : ""}>${known ? fmtSize(it.sz) : ""}${bar}</span>`;
}

// ctx: { sort, pathOf(it), bars }
export function renderList(list, { sort, pathOf, bars }) {
  const { key, dir } = sort;
  const max = bars ? Math.max(0, ...list.map((it) => it.sz || 0)) : 0;
  const total = list.reduce((a, it) => a + (it.sz || 0), 0);
  const sh = (k, label, cls = "") =>
    `<span class="${cls}"><button data-sort="${k}" class="${key === k && dir === 1 ? "asc" : ""}">${label}${key === k ? icon("chev-down") : ""}</button></span>`;
  return `<div class="table"><div class="row head"><span></span>${sh("name", "Name")}${sh("size", "Size", "num")}${sh("date", "Modified", "date")}<span></span></div>` +
    list.map((it, i) => {
      const path = pathOf(it);
      const k = kindOf(it.name, it.dir);
      const th = !it.dir && isImage(it.name) && hasThumb(it.name) ? thumbImg(path) : "";
      return `<div class="row" data-i="${i}" ${dropAttr(it, path)}>
        <span class="check" data-check>${icon("check")}</span>
        <a class="name" href="${esc(it.dir ? path : fileUrl(path))}" data-open>
          <span class="ficon ${k}">${icon(ICON[k])}${th}</span>
          <span title="${esc(it.name)}">${esc(it.name)}${it.path ? `<br><small class="path-hint">${esc(dec(parentOf(it.path)))}</small>` : ""}</span>
        </a>
        ${sizeCell(it, max, total)}
        <span class="date">${fmtDate(it.ts)}</span>
        <button class="icon-btn sm more" data-more title="More">${icon("dots")}</button>
      </div>`;
    }).join("") + `</div>`;
}
