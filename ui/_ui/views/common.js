// Bits of markup shared by the list and grid views.
import { esc } from "../core/dom.js";
import { thumbUrl } from "../core/api.js";
import { plural } from "../core/format.js";

export const thumbImg = (path) => `<img loading="lazy" src="${esc(thumbUrl(path))}" alt="" data-thumb>`;

export const dropAttr = (it, path) => (it.dir ? `data-drop="${esc(path)}"` : "");

export const itemCount = (it) => (it.n != null ? plural(it.n, "item") : "");
