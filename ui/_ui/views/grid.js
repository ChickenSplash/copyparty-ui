import { esc, icon } from "../core/dom.js";
import { dec, fmtSize } from "../core/format.js";
import { kindOf, ICON, hasThumb } from "../core/kinds.js";
import { parentOf } from "../core/paths.js";
import { thumbImg, dropAttr, itemCount } from "./common.js";

// ctx: { pathOf(it) }
export function renderGrid(list, { pathOf }) {
  return `<div class="grid">` + list.map((it, i) => {
    const path = pathOf(it);
    const k = kindOf(it.name, it.dir);
    const th = icon(ICON[k]) + (!it.dir && hasThumb(it.name) ? thumbImg(path) : "");
    const sub = it.dir ? itemCount(it) || "Folder" : fmtSize(it.sz);
    return `<div class="tile ${k === "dir" ? "dir" : ""}" data-i="${i}" ${dropAttr(it, path)}>
      <div class="thumb">${th}</div>
      <div class="meta"><b title="${esc(it.name)}">${esc(it.name)}</b><small>${esc(sub)}${it.path ? " · " + esc(dec(parentOf(it.path))) : ""}</small></div>
      <span class="check" data-check>${icon("check")}</span>
      <button class="icon-btn sm more" data-more title="More">${icon("dots")}</button>
    </div>`;
  }).join("") + `</div>`;
}
