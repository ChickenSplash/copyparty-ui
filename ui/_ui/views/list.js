import { esc, icon } from "../core/dom.js";
import { fileUrl } from "../core/api.js";
import { dec, fmtSize, fmtDate } from "../core/format.js";
import { kindOf, ICON, hasThumb, isImage } from "../core/kinds.js";
import { parentOf } from "../core/paths.js";
import { thumbImg, dropAttr, itemCount } from "./common.js";

// ctx: { sort, pathOf(it) }
export function renderList(list, { sort, pathOf }) {
  const { key, dir } = sort;
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
        <span class="num">${it.dir ? itemCount(it) : fmtSize(it.sz)}</span>
        <span class="date">${fmtDate(it.ts)}</span>
        <button class="icon-btn sm more" data-more title="More">${icon("dots")}</button>
      </div>`;
    }).join("") + `</div>`;
}
